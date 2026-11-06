import { create } from 'zustand';

interface NewTaskState {
  /** The main checkout the dialog creates a task in; null while closed. */
  repoPath: string | null;
}

export const useNewTask = create<NewTaskState>(() => ({ repoPath: null }));

export function openNewTask(repoPath: string) {
  useNewTask.setState({ repoPath });
}

export function closeNewTask() {
  useNewTask.setState({ repoPath: null });
}
