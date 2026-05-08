package com.snow.plugin.actions

import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.components.service
import com.intellij.openapi.project.DumbAwareAction
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.vcs.VcsDataKeys
import com.snow.plugin.commit.SnowCommitMessageGenerationService
import icons.SnowPluginIcons
import java.awt.event.InputEvent

class GenerateCommitMessageAction : DumbAwareAction() {

    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val commitMessageControl = e.getData(VcsDataKeys.COMMIT_MESSAGE_CONTROL)
        val commitWorkflowUi = e.getData(VcsDataKeys.COMMIT_WORKFLOW_UI)
        val service = project.service<SnowCommitMessageGenerationService>()

        if (service.isGenerating()) {
            service.generate(commitMessageControl, commitWorkflowUi?.commitMessageUi)
            return
        }

        val shouldAskForRequirements = hasRequirementsModifier(e)
        val additionalRequirements = if (shouldAskForRequirements) {
            val input = Messages.showInputDialog(
                project,
                "Add optional requirements for the generated commit message.",
                "Snow CLI: Commit Message Requirements",
                Messages.getQuestionIcon(),
            ) ?: return
            input.trim().ifEmpty { null }
        } else {
            null
        }

        service.generate(
            commitMessageControl,
            commitWorkflowUi?.commitMessageUi,
            additionalRequirements,
        )
    }

    override fun update(e: AnActionEvent) {
        val project = e.project
        val hasCommitMessageTarget = e.getData(VcsDataKeys.COMMIT_MESSAGE_CONTROL) != null ||
            e.getData(VcsDataKeys.COMMIT_WORKFLOW_UI) != null
        val isGenerating = project?.service<SnowCommitMessageGenerationService>()?.isGenerating() == true

        e.presentation.icon = if (isGenerating) {
            SnowPluginIcons.SnowStopToolbarAction
        } else {
            SnowPluginIcons.SnowToolbarAction
        }

        e.presentation.isEnabledAndVisible = project != null && hasCommitMessageTarget
        e.presentation.text = if (isGenerating) {
            "Cancel Commit Message Generation"
        } else {
            "Generate Commit Message"
        }
        e.presentation.description = if (isGenerating) {
            "Cancel Snow CLI commit message generation"
        } else {
            "Generate a commit message with Snow CLI AI. Alt/Option-click to add requirements."
        }
    }

    private fun hasRequirementsModifier(e: AnActionEvent): Boolean {
        return (e.inputEvent?.modifiersEx ?: 0) and InputEvent.ALT_DOWN_MASK != 0
    }
}
