import React from 'react';
import {Box, Text} from 'ink';
import Gradient from 'ink-gradient';
import {useI18n} from '../../../i18n/I18nContext.js';
import {useTheme} from '../../contexts/ThemeContext.js';

type ChatHeaderProps = {
	terminalWidth: number;
	simpleMode: boolean;
	workingDirectory: string;
};

export default function ChatHeader({
	terminalWidth,
	simpleMode,
	workingDirectory,
}: ChatHeaderProps) {
	const {t} = useI18n();
	const {theme} = useTheme();

	return (
		<Box paddingX={1} width={terminalWidth}>
			{simpleMode ? (
				// Simple mode: No border, smaller logo
				<Box paddingX={1} paddingY={1}>
					<Box flexDirection="column">
						{/* Simple mode: Show responsive ASCII art title */}
						<ChatHeaderLogo
							terminalWidth={terminalWidth}
							logoGradient={theme.colors.logoGradient}
						/>
						<Text color={theme.colors.menuSecondary} dimColor>
							{t.chatScreen.headerWorkingDirectory.replace(
								'{directory}',
								workingDirectory,
							)}
						</Text>
					</Box>
				</Box>
			) : (
				// Normal mode: With border and tips
				<Box
					borderColor={'cyan'}
					borderStyle="round"
					paddingX={1}
					paddingY={1}
					width={terminalWidth - 2}
				>
					<Box flexDirection="column">
						<Text color="white" bold>
							<Text color="cyan">❆ </Text>
							<Gradient colors={theme.colors.logoGradient}>SNOW CLI</Gradient>
							<Text color="white"> ⛇</Text>
						</Text>
						<Text>• {t.chatScreen.headerExplanations}</Text>
						<Text>• {t.chatScreen.headerInterrupt}</Text>
						<Text>• {t.chatScreen.headerYolo}</Text>
						<Text>
							{(() => {
								const pasteKey =
									process.platform === 'darwin' ? 'Ctrl+V' : 'Alt+V';
								return `• ${t.chatScreen.headerShortcuts.replace(
									'{pasteKey}',
									pasteKey,
								)}`;
							})()}
						</Text>
						<Text>• {t.chatScreen.headerExpandedView}</Text>
						{process.platform === 'win32' && (
							<Text>• Ctrl+G (Notepad edit)</Text>
						)}
						<Text color={theme.colors.menuSecondary} dimColor>
							•{' '}
							{t.chatScreen.headerWorkingDirectory.replace(
								'{directory}',
								workingDirectory,
							)}
						</Text>
					</Box>
				</Box>
			)}
		</Box>
	);
}

// Responsive ASCII art logo component for simple mode
export function ChatHeaderLogo({
	terminalWidth,
	logoGradient,
	hideCompact = false,
}: {
	terminalWidth: number;
	logoGradient: [string, string, string];
	// 当为 true 时，宽度过窄（< 20）不再回退到最小 LOGO，而是直接不渲染。
	// 用于 WelcomeScreen 这种"位置紧张时宁可隐藏也不要降级展示"的场景。
	hideCompact?: boolean;
}) {
	if (terminalWidth >= 30) {
		// Full version: SNOW CLI with thin style (width >= 30)
		return (
			<Box flexDirection="column" marginBottom={0}>
				<Gradient colors={logoGradient}>
					<Text>
						{`╔═╗╔╗╔╔═╗╦ ╦  ╔═╗╦  ╦
╚═╗║║║║ ║║║║  ║  ║  ║
╚═╝╝╚╝╚═╝╚╩╝  ╚═╝╩═╝╩`}
					</Text>
				</Gradient>
			</Box>
		);
	}

	if (terminalWidth >= 20) {
		// Medium version: SNOW only (width 20-29)
		return (
			<Box flexDirection="column" marginBottom={0}>
				<Gradient colors={logoGradient}>
					<Text>
						{`╔═╗╔╗╔╔═╗╦ ╦
╚═╗║║║║ ║║║║
╚═╝╝╚╝╚═╝╚╩╝`}
					</Text>
				</Gradient>
			</Box>
		);
	}

	// Compact version: Normal text (width < 20)
	// 当 hideCompact=true 时，调用方明确要求"宽度不够就直接不渲染最小 LOGO"，
	// 避免在 WelcomeScreen 右半区被压缩时还塞一行 "❆ SNOW CLI" 文本。
	if (hideCompact) {
		return null;
	}
	return (
		<Box marginBottom={0}>
			<Text>
				<Text color="cyan">❆ </Text>
				<Gradient colors={logoGradient}>SNOW CLI</Gradient>
			</Text>
		</Box>
	);
}
