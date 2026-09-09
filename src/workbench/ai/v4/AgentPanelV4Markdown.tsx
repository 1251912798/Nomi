// Answers and actionable next steps remain visible. Process and user-message folding
// have their own semantic boundaries; rendered height cannot classify importance.
import React from 'react'
import { NomiMarkdown } from '../../common/NomiMarkdown'
import { useTranslation } from 'react-i18next'

export function AgentPanelV4Markdown({ text }: {
  text: string
  panelHeight?: number
  streaming?: boolean
}): JSX.Element {
  const { t } = useTranslation()
  return (
    <div className="min-w-0" data-v4-markdown="true">
      <NomiMarkdown compact profile="agent-v4" copyLabel={t('agentPanelV4.copy')}
        imageLabel={t('agentPanelV4.image')} expandLabel={t('agentPanelV4.expand')}
        collapseLabel={t('agentPanelV4.collapse')}>
        {text}
      </NomiMarkdown>
    </div>
  )
}
