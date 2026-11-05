// Names that title case would get wrong; any other category is title cased from its enum value.
const CATEGORY_NAMES: Record<string, string> = { CLOUD_DEVOPS: 'Cloud and DevOps' };

export const categoryName = (value: string) =>
  CATEGORY_NAMES[value] ??
  value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
