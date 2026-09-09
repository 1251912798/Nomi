// Shared safety ceiling, never a completion condition: callers still observe DOM,
// persisted state, approval, or terminal jobs. A model turn has two 150s phases;
// local actions share a 15s scheduling allowance per operation.
export function stationTimeout({ turns = 0, operations = 1 } = {}) {
  if (![turns, operations].every(n => Number.isInteger(n) && n >= 0) || turns + operations === 0)
    throw Error('INVALID_STATION_BUDGET')
  return turns * 2 * 150_000 + operations * 15_000
}
