import type { IButtonStyles } from '@fluentui/react';

/** Muted sage primary actions (calmer than default SharePoint blue). */
export const calmPrimaryButtonStyles: IButtonStyles = {
  root: {
    backgroundColor: '#4f7a6c',
    borderColor: '#3d6256',
    selectors: {
      ':hover': { backgroundColor: '#426658', borderColor: '#35574d' },
      ':active': { backgroundColor: '#35574d', borderColor: '#2d4a40' }
    }
  },
  rootDisabled: {
    backgroundColor: '#b0c4bc',
    borderColor: '#9db5a8'
  }
};
