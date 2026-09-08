---
name: effect-scene-three-view
description: 场景三视图：使用连接的参考，保留主体一致性。 用户要求场景三视图时使用。
license: Apache-2.0
disable-model-invocation: true
metadata:
  nomi:
    version: 1.0.0
    label: 场景三视图
    selectable-in-workbench: false
    tools: []
    required-providers:
      - image
    library:
      kind: effect
      title:
        zh-CN: 场景三视图
        en: Scene views
      summary:
        zh-CN: 场景三视图：使用连接的参考，保留主体一致性。
        en: 场景三视图：使用连接的参考，保留主体一致性。
      appliesTo:
        - image
      group:
        zh-CN: 场景
        en: Scene
      slots:
        - token: '{场景}'
          reference: scene
      source:
        url: https://github.com/PicoTrex/Awesome-Nano-Banana-images/blob/2558bf0bb825be150c5d1aeab918cd90004882d3/README.md
        revision: 2558bf0bb825be150c5d1aeab918cd90004882d3
        author: https://x.com/Error_HTTP_404/status/1960405116701303294
        changes: >-
          Nomi adds Chinese task labels, reference slots and review criteria; fixed subjects are parameterized where
          noted.
        evidence:
          - https://x.com/Error_HTTP_404/status/1960405116701303294
          - https://x.com/Error_HTTP_404
---

以参考中的{场景}为同一空间，制作正视、侧视与俯视三格场景设定。保持门窗位置、主体比例、材质和光线方向一致。每格表现同一空间，不要画成三个不同房间。
