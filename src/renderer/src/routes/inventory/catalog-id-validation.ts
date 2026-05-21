export function catalogItemIdErrorMessage(
  t: (key: string) => string,
  error: 'required' | 'invalid' | 'duplicate' | null,
) {
  switch (error) {
    case 'required':
      return t('catalogItemEditorIdentifierErrorRequired');
    case 'invalid':
      return t('catalogItemEditorIdentifierErrorInvalid');
    case 'duplicate':
      return t('catalogItemEditorIdentifierErrorDuplicate');
    default:
      return null;
  }
}
