import { AutocompleteChoice } from 'slash-create'

export const alphabetical = (a: AutocompleteChoice, b: AutocompleteChoice): number =>
  a.name.localeCompare(b.name)

// Users generally intuit that no input should mean "list all alternatives", not "list none because no option is literally ''"
export const humanLikely = (input: string, likely: string[], matchingAgainst: string): boolean =>
  input === '' || likely.includes(matchingAgainst)
