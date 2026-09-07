import { walkDesignLabScreen } from './design-lab/walkScreen.mjs'

await walkDesignLabScreen({
  screen: 'catalog-liveness', title: '模型目录活性', role: 'walk-catalog-liveness', cellWidth: 960, columns: 2,
  viewport: { width: 960, height: 760 },
  assertState: async (page, state, record) => {
    const note = page.getByText('供应商已不再列出', { exact: true })
    if (await note.count() !== 1) record(`${state.id}: expected one unlisted note`)
    if (await page.getByRole('button', { name: '更多', exact: true }).count() !== 1) record(`${state.id}: legacy fold missing`)
    if (await page.getByRole('button', { name: '删除', exact: true }).count() !== 1) record(`${state.id}: one-click deletion missing`)
    await page.getByRole('button', { name: 'DeepSeek V4 Flash', exact: true }).click()
    const toggle = page.getByRole('switch')
    if (await toggle.isChecked()) record(`${state.id}: unlisted model was enabled`)
    await page.locator(`label[for="${await toggle.getAttribute('id')}"]`).click()
    if (!await toggle.isChecked()) record(`${state.id}: manual enable failed`)
    await page.getByRole('button', { name: '返回', exact: true }).click()
    await page.getByRole('button', { name: '更多', exact: true }).click()
    await page.getByRole('button', { name: '删除', exact: true }).click()
    if (await note.count()) record(`${state.id}: one-click deletion did not remove row`)
  },
})
