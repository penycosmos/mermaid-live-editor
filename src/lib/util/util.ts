import { applyMigrations } from './migrations.svelte';
import { initURLSubscription, loadState, updateCodeStore, verifyState } from './state.svelte';

export const loadStateFromURL = (): void => loadState(window.location.hash.slice(1));

export const syncDiagram = (): void => updateCodeStore({ updateDiagram: true });

export const initHandler = (): void => {
  applyMigrations();
  loadStateFromURL();
  syncDiagram();
  initURLSubscription();
  verifyState();
};

export const formatJSON = (data: unknown): string => JSON.stringify(data, undefined, 2);
export const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    fallbackCopyToClipboard(text);
  }
};

function fallbackCopyToClipboard(text: string) {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  // Make the textarea out of viewport
  textArea.style.position = 'fixed';
  textArea.style.left = '-999999px';
  textArea.style.top = '-999999px';
  document.body.append(textArea);

  textArea.focus();
  textArea.select();

  try {
    // The deprecated but widely supported method
    document.execCommand('copy');
  } catch (error) {
    console.error('Failed to copy:', error);
    throw error;
  } finally {
    textArea.remove();
  }
}
