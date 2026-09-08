---
name: effect-storyboard-panels
description: 宽屏分镜：使用连接的参考，保留主体一致性。 用户要求宽屏分镜时使用。
license: Apache-2.0
disable-model-invocation: true
metadata:
  nomi:
    version: 1.0.0
    label: 宽屏分镜
    selectable-in-workbench: false
    tools: []
    required-providers:
      - image
    library:
      kind: effect
      title:
        zh-CN: 宽屏分镜
        en: Widescreen storyboard
      summary:
        zh-CN: 宽屏分镜：使用连接的参考，保留主体一致性。
        en: 宽屏分镜：使用连接的参考，保留主体一致性。
      appliesTo:
        - image
      group:
        zh-CN: 分镜
        en: Storyboard
      slots:
        - token: '{剧本文字}'
          reference: text
      source:
        url: https://github.com/PicoTrex/Awesome-Nano-Banana-images/blob/2558bf0bb825be150c5d1aeab918cd90004882d3/README.md
        revision: 2558bf0bb825be150c5d1aeab918cd90004882d3
        author: https://x.com/jamesyeung18/status/1992597408128045462?s=20
        changes: >-
          Nomi adds Chinese task labels, reference slots and review criteria; fixed subjects are parameterized where
          noted.
        evidence:
          - https://x.com/jamesyeung18/status/1992597408128045462?s=20
          - https://x.com/jamesyeung18
---

根据{剧本文字}绘制连续的宽屏分镜。每格一个明确机位和动作，保持角色身份与场景方向；不要在图片中写对白或镜头编号。
