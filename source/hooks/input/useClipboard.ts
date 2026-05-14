import {useCallback} from 'react';
import {exec} from 'child_process';
import {promisify} from 'util';
import {TextBuffer} from '../../utils/ui/textBuffer.js';
import {logger} from '../../utils/core/logger.js';
import {isWSL} from '../../mcp/utils/websearch/browser.utils.js';

// 使用异步 exec 替代 execSync，避免阻塞 React 渲染线程，
// 这样 [image upload...] loading 占位符可以及时显示。
const execAsync = promisify(exec);

export function useClipboard(
	buffer: TextBuffer,
	updateCommandPanelState: (text: string) => void,
	updateFilePickerState: (text: string, cursorPos: number) => void,
	triggerUpdate: () => void,
) {
	const pasteFromClipboard = useCallback(async () => {
		// 立即插入 "[image upload...]" 临时占位符并触发渲染，
		// 让用户在等待剪贴板读取（可能耗时数秒）期间有视觉反馈。
		buffer.insertImageLoadingIndicator();
		{
			const text = buffer.getFullText();
			const cursorPos = buffer.getCursorPosition();
			updateCommandPanelState(text);
			updateFilePickerState(text, cursorPos);
		}
		triggerUpdate();

		// 让出事件循环，确保 React 完成至少一次渲染 commit，
		// 否则后续的 await 仍可能在第一次 paint 之前阻塞 UI。
		await new Promise(resolve => setTimeout(resolve, 0));

		let imageInserted = false;

		try {
			const isWslEnv = process.platform === 'linux' && isWSL();
			const psCmd = isWslEnv ? 'powershell.exe' : 'powershell';

			// Try to read image from clipboard
			if (process.platform === 'win32' || isWslEnv) {
				// Windows / WSL: Use PowerShell to read image from clipboard
				try {
					// Optimized PowerShell script with compression for large images
					const psScript =
						'Add-Type -AssemblyName System.Windows.Forms; ' +
						'Add-Type -AssemblyName System.Drawing; ' +
						'$clipboard = [System.Windows.Forms.Clipboard]::GetImage(); ' +
						'if ($clipboard -ne $null) { ' +
						'$ms = New-Object System.IO.MemoryStream; ' +
						'$width = $clipboard.Width; ' +
						'$height = $clipboard.Height; ' +
						'$maxSize = 2048; ' +
						'if ($width -gt $maxSize -or $height -gt $maxSize) { ' +
						'$ratio = [Math]::Min($maxSize / $width, $maxSize / $height); ' +
						'$newWidth = [int]($width * $ratio); ' +
						'$newHeight = [int]($height * $ratio); ' +
						'$resized = New-Object System.Drawing.Bitmap($newWidth, $newHeight); ' +
						'$graphics = [System.Drawing.Graphics]::FromImage($resized); ' +
						'$graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality; ' +
						'$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic; ' +
						'$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality; ' +
						'$graphics.DrawImage($clipboard, 0, 0, $newWidth, $newHeight); ' +
						'$resized.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png); ' +
						'$graphics.Dispose(); ' +
						'$resized.Dispose(); ' +
						'} else { ' +
						'$clipboard.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png); ' +
						'}; ' +
						'$bytes = $ms.ToArray(); ' +
						'$ms.Close(); ' +
						'[Convert]::ToBase64String($bytes); ' +
						'}';

					let base64Raw: string;
					if (isWslEnv) {
						// WSL: bash expands $var inside double-quotes, mangling the script.
						// Use -EncodedCommand (base64 UTF-16LE) to bypass all shell interpretation.
						const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
						const {stdout} = await execAsync(
							`${psCmd} -NoProfile -EncodedCommand ${encoded}`,
							{
								encoding: 'utf-8',
								timeout: 10000,
								maxBuffer: 50 * 1024 * 1024,
							},
						);
						base64Raw = stdout;
					} else {
						const {stdout} = await execAsync(
							`${psCmd} -NoProfile -Command "${psScript}"`,
							{
								encoding: 'utf-8',
								timeout: 10000,
								maxBuffer: 50 * 1024 * 1024,
							},
						);
						base64Raw = stdout;
					}

					// 高效清理：一次性移除所有空白字符
					const base64 = base64Raw.replace(/\s/g, '');

					if (base64 && base64.length > 100) {
						// insertImage 内部会自动移除 "[image upload...]" 占位符
						buffer.insertImage(base64, 'image/png');
						imageInserted = true;
						const text = buffer.getFullText();
						const cursorPos = buffer.getCursorPosition();
						updateCommandPanelState(text);
						updateFilePickerState(text, cursorPos);
						triggerUpdate();
						return;
					}
				} catch (imgError) {
					// No image in clipboard or error, fall through to text
					logger.error(
						'Failed to read image from Windows clipboard:',
						imgError,
					);
				}
			} else if (process.platform === 'darwin') {
				// macOS: Use osascript to read image from clipboard
				try {
					// First check if there's an image in clipboard
					const checkScript = `osascript -e 'try
	set imgData to the clipboard as «class PNGf»
	return "hasImage"
on error
	return "noImage"
end try'`;

					const {stdout: hasImageStdout} = await execAsync(checkScript, {
						encoding: 'utf-8',
						timeout: 2000,
					});
					const hasImage = hasImageStdout.trim();

					if (hasImage === 'hasImage') {
						// Save clipboard image to temporary file and read it
						const tmpFile = `/tmp/snow_clipboard_${Date.now()}.png`;
						const saveScript = `osascript -e 'set imgData to the clipboard as «class PNGf»' -e 'set fileRef to open for access POSIX file "${tmpFile}" with write permission' -e 'write imgData to fileRef' -e 'close access fileRef'`;

						await execAsync(saveScript, {
							encoding: 'utf-8',
							timeout: 3000,
						});

						// Use sips to resize if needed, then convert to base64
						// First check image size
						const {stdout: sizeCheck} = await execAsync(
							`sips -g pixelWidth -g pixelHeight "${tmpFile}" | grep -E "pixelWidth|pixelHeight" | awk '{print $2}'`,
							{
								encoding: 'utf-8',
								timeout: 2000,
							},
						);
						const [widthStr, heightStr] = sizeCheck.trim().split('\n');
						const width = parseInt(widthStr || '0', 10);
						const height = parseInt(heightStr || '0', 10);
						const maxSize = 2048;

						// Resize if too large
						if (width > maxSize || height > maxSize) {
							const ratio = Math.min(maxSize / width, maxSize / height);
							const newWidth = Math.floor(width * ratio);
							const newHeight = Math.floor(height * ratio);
							await execAsync(
								`sips -z ${newHeight} ${newWidth} "${tmpFile}" --out "${tmpFile}"`,
								{
									encoding: 'utf-8',
									timeout: 5000,
								},
							);
						}

						// Read the file as base64 with optimized buffer
						const {stdout: base64Raw} = await execAsync(
							`base64 -i "${tmpFile}"`,
							{
								encoding: 'utf-8',
								timeout: 5000,
								maxBuffer: 50 * 1024 * 1024, // 50MB buffer
							},
						);
						// 高效清理：一次性移除所有空白字符
						const base64 = base64Raw.replace(/\s/g, '');

						// Clean up temp file
						try {
							await execAsync(`rm "${tmpFile}"`, {timeout: 1000});
						} catch (e) {
							// Ignore cleanup errors
						}

						if (base64 && base64.length > 100) {
							// insertImage 内部会自动移除 "[image upload...]" 占位符
							buffer.insertImage(base64, 'image/png');
							imageInserted = true;
							const text = buffer.getFullText();
							const cursorPos = buffer.getCursorPosition();
							updateCommandPanelState(text);
							updateFilePickerState(text, cursorPos);
							triggerUpdate();
							return;
						}
					}
				} catch (imgError) {
					logger.error('Failed to read image from macOS clipboard:', imgError);
				}
			}

			// 没读到图片，移除 loading 占位符再走文本路径，
			// 避免 [image upload...] 留在输入框里。
			buffer.removeTempPlaceholder();

			// If no image, try to read text from clipboard
			try {
				let clipboardText = '';
				if (process.platform === 'win32' || isWslEnv) {
					const {stdout} = await execAsync(
						`${psCmd} -NoProfile -Command "Get-Clipboard"`,
						{
							encoding: 'utf-8',
							timeout: 2000,
						},
					);
					clipboardText = stdout.trim();
				} else if (process.platform === 'darwin') {
					const {stdout} = await execAsync('pbpaste', {
						encoding: 'utf-8',
						timeout: 2000,
					});
					clipboardText = stdout.trim();
				} else {
					const {stdout} = await execAsync('xclip -selection clipboard -o', {
						encoding: 'utf-8',
						timeout: 2000,
					});
					clipboardText = stdout.trim();
				}

				if (clipboardText) {
					buffer.insert(clipboardText);
					const fullText = buffer.getFullText();
					const cursorPos = buffer.getCursorPosition();
					updateCommandPanelState(fullText);
					updateFilePickerState(fullText, cursorPos);
					triggerUpdate();
				}
			} catch (textError) {
				logger.error('Failed to read text from clipboard:', textError);
			}
		} catch (error) {
			logger.error('Failed to read from clipboard:', error);
		} finally {
			// 兜底：确保 loading 占位符在任何异常路径下都不会残留
			if (!imageInserted) {
				buffer.removeTempPlaceholder();
				triggerUpdate();
			}
		}
	}, [buffer, updateCommandPanelState, updateFilePickerState, triggerUpdate]);

	return {pasteFromClipboard};
}
