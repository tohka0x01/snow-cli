import {spawnSync} from 'child_process';

/**
 * Trigger an in-place global update of snow-ai.
 *
 * Steps:
 * 1. Unmount Ink so the React tree releases stdin/raw mode and the terminal
 *    is back to a normal scrollback state.
 * 2. Print a short progress hint.
 * 3. Run `npm i -g snow-ai` synchronously with stdio inherited so the user
 *    sees real-time npm output.
 * 4. Exit the CLI with the npm exit code (0 on success, otherwise non-zero).
 *
 * The function never returns: the process is terminated via process.exit().
 */
export function runUpdateAndExit(): never {
	// Best-effort: unmount Ink before handing the terminal to npm.
	try {
		const mainInk = (global as any).__mainInk;
		if (mainInk && typeof mainInk.unmount === 'function') {
			mainInk.unmount();
		}
	} catch {
		// Ignore unmount errors — already unmounted or in bad state.
	}

	// Restore cursor visibility / disable bracketed paste mode just in case
	// Ink's unmount path didn't run far enough.
	try {
		process.stdout.write('\x1b[?2004l');
		process.stdout.write('\x1b[?25h');
		process.stdout.write('\x1b[0 q');
	} catch {
		// Best-effort terminal restore
	}

	console.log('\nUpdating snow-ai to the latest version...\n');

	let exitCode = 0;
	try {
		const result = spawnSync('npm i -g snow-ai', {
			stdio: 'inherit',
			shell: true,
		});

		if (result.error) {
			console.error(
				'\nUpdate failed:',
				result.error instanceof Error
					? result.error.message
					: String(result.error),
			);
			console.log('\nYou can also update manually:\n  npm i -g snow-ai');
			exitCode = 1;
		} else if (typeof result.status === 'number' && result.status !== 0) {
			console.error(`\nUpdate failed: npm exited with code ${result.status}`);
			console.log('\nYou can also update manually:\n  npm i -g snow-ai');
			exitCode = result.status;
		} else {
			console.log('\nUpdate completed successfully.');
		}
	} catch (error) {
		console.error(
			'\nUpdate failed:',
			error instanceof Error ? error.message : String(error),
		);
		console.log('\nYou can also update manually:\n  npm i -g snow-ai');
		exitCode = 1;
	}

	// On a successful update, seamlessly relaunch `snow` so the user lands
	// back in the freshly-installed CLI without having to retype anything.
	// We block on the child via spawnSync (stdio inherited) so signals, TTY
	// and exit codes all flow through naturally; when the new snow exits,
	// this process exits with the same status.
	if (exitCode === 0) {
		console.log('\nRestarting snow with the new version...\n');
		try {
			const restart = spawnSync('snow', [], {
				stdio: 'inherit',
				shell: true,
			});

			if (restart.error) {
				console.error(
					'\nFailed to restart snow automatically:',
					restart.error instanceof Error
						? restart.error.message
						: String(restart.error),
				);
				console.log('You can start it manually by running: snow');
				process.exit(0);
			}

			process.exit(typeof restart.status === 'number' ? restart.status : 0);
		} catch (error) {
			console.error(
				'\nFailed to restart snow automatically:',
				error instanceof Error ? error.message : String(error),
			);
			console.log('You can start it manually by running: snow');
			process.exit(0);
		}
	}

	process.exit(exitCode);
}
