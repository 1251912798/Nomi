---
name: effect-expression-grid
description: 表情九宫格：使用连接的参考，保留主体一致性。 用户要求表情九宫格时使用。
license: Apache-2.0
disable-model-invocation: true
metadata:
  nomi:
    version: 1.0.0
    label: 表情九宫格
    selectable-in-workbench: false
    tools: []
    required-providers:
      - image
    library:
      kind: effect
      title:
        zh-CN: 表情九宫格
        en: Expression grid
      summary:
        zh-CN: 表情九宫格：使用连接的参考，保留主体一致性。
        en: 表情九宫格：使用连接的参考，保留主体一致性。
      appliesTo:
        - image
      group:
        zh-CN: 角色设定
        en: Character
      slots:
        - token: '{角色名}'
          reference: character
      source:
        url: https://github.com/PicoTrex/Awesome-Nano-Banana-images/blob/2558bf0bb825be150c5d1aeab918cd90004882d3/README.md
        revision: 2558bf0bb825be150c5d1aeab918cd90004882d3
        author: https://x.com/vista8/status/1966164427243458977
        changes: >-
          Nomi adds Chinese task labels, reference slots and review criteria; fixed subjects are parameterized where
          noted.
        evidence:
          - https://x.com/vista8/status/1966164427243458977
          - https://x.com/vista8
---

以{角色名}为同一角色，参照姿势图生成九种表情的九宫格。保持发型、面部比例和服装一致，每格一种表情，纯色背景，无文字。
