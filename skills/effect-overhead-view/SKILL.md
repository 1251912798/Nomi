---
name: effect-overhead-view
description: 俯视构图：使用连接的参考，保留主体一致性。 用户要求俯视构图时使用。
license: Apache-2.0
disable-model-invocation: true
metadata:
  nomi:
    version: 1.0.0
    label: 俯视构图
    selectable-in-workbench: false
    tools: []
    required-providers:
      - image
    library:
      kind: effect
      title:
        zh-CN: 俯视构图
        en: Overhead composition
      summary:
        zh-CN: 俯视构图：使用连接的参考，保留主体一致性。
        en: 俯视构图：使用连接的参考，保留主体一致性。
      appliesTo:
        - image
      group:
        zh-CN: 构图
        en: Composition
      slots:
        - token: '{场景}'
          reference: scene
      source:
        url: https://github.com/PicoTrex/Awesome-Nano-Banana-images/blob/2558bf0bb825be150c5d1aeab918cd90004882d3/README.md
        revision: 2558bf0bb825be150c5d1aeab918cd90004882d3
        author: https://x.com/op7418/status/1960896630586310656
        changes: >-
          Nomi adds Chinese task labels, reference slots and review criteria; fixed subjects are parameterized where
          noted.
        evidence:
          - https://x.com/op7418/status/1960896630586310656
          - https://x.com/op7418
---

将参考中的{场景}改为俯视角度。保留物体相对位置、数量与光线方向，不凭空加入人物或文字。
