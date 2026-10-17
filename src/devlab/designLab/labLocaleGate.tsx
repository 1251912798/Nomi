// 实验室格子里「这一格用哪种语言」的小闸：切完语言之前不举就绪旗，否则截到的是上一格的语言。
// 只给"同一屏里某几格要英文"这种场景用；整屏固定语言的屏不需要它。
import React, { type JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { holdDesignLabReady } from './labReadyHold'

export function LabLocaleGate({ locale, children }: { locale: 'zh-CN' | 'en'; children: React.ReactNode }): JSX.Element {
  const { i18n } = useTranslation()
  const [applied, setApplied] = React.useState(i18n.language === locale)
  React.useLayoutEffect(() => {
    if (i18n.language === locale) { setApplied(true); return undefined }
    setApplied(false)
    const release = holdDesignLabReady(`lab-locale:${locale}`)
    void i18n.changeLanguage(locale).then(() => { setApplied(true); release() })
    return release
  }, [i18n, locale])
  return <>{applied ? children : null}</>
}
