/**
 * Stub: types/notebook.ts — missing from source map extraction.
 */

export type NotebookCellType = 'code' | 'markdown' | 'raw';

export interface NotebookCellSource {
  [key: string]: unknown;
}

export interface NotebookOutputImage {
  [key: string]: unknown;
}

export interface NotebookCellSourceOutput {
  [key: string]: unknown;
}

export interface NotebookCellOutput {
  [key: string]: unknown;
}

export interface NotebookCell {
  cell_type: NotebookCellType;
  source: string | string[];
  outputs?: NotebookCellOutput[];
  [key: string]: unknown;
}

export interface NotebookContent {
  cells: NotebookCell[];
  [key: string]: unknown;
}
