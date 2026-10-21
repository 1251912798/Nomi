import React from 'react'
import { useTranslation } from 'react-i18next'
import { holdDesignLabReady } from '../labReadyHold'

/** 把界面语言切到格子要的那种；切好之前持有就绪旗，避免截到半中半英的一帧。返回「语言已就绪」。 */
export function useLabLocale(locale: 'zh-CN' | 'en', holdKey: string): boolean {
  const { i18n } = useTranslation()
  const [ready, setReady] = React.useState(i18n.language === locale)
  React.useEffect(() => {
    if (i18n.language === locale) { setReady(true); return undefined }
    const release = holdDesignLabReady(`${holdKey}:locale:${locale}`)
    void i18n.changeLanguage(locale).then(() => { setReady(true); release() })
    return release
  }, [i18n, locale, holdKey])
  return ready
}
