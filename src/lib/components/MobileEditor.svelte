<script lang="ts">
  import type { EditorProps } from '$/types';
  import { validatedState } from '$/util/state.svelte';
  import { json } from '@codemirror/lang-json';
  import { markdown } from '@codemirror/lang-markdown';
  import { yamlFrontmatter } from '@codemirror/lang-yaml';
  import { Compartment, EditorState } from '@codemirror/state';
  import { EditorView } from '@codemirror/view';
  import { vsCodeDark } from '@fsegurai/codemirror-theme-vscode-dark';
  import { vsCodeLight } from '@fsegurai/codemirror-theme-vscode-light';
  import { basicSetup } from 'codemirror';
  import { mode } from 'mode-watcher';
  import { onMount, untrack } from 'svelte';

  let editorView: EditorView | undefined;
  let editorContainer: HTMLDivElement;
  // Deliberately not $state: the sync effect below both reads and writes it,
  // so a reactive currentText would make every keystroke re-run the effect
  // against the not-yet-revalidated state and revert the user's input.
  let currentText = '';
  let activeMode = validatedState.current.editorMode;
  const documents: Partial<Record<typeof activeMode, EditorState>> = {};
  const themeCompartment = new Compartment();
  const languageCompartment = new Compartment();

  const { onUpdate }: EditorProps = $props();

  const applyTheme = () =>
    editorView?.dispatch({
      effects: themeCompartment.reconfigure(mode.current === 'dark' ? vsCodeDark : vsCodeLight)
    });
  $effect(applyTheme);

  const createDocument = (text: string, isConfig: boolean) =>
    EditorState.create({
      doc: text,
      extensions: [
        basicSetup,
        languageCompartment.of(isConfig ? json() : yamlFrontmatter({ content: markdown() })),
        themeCompartment.of([]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const newText = update.state.doc.toString();
            if (currentText === newText) {
              return;
            }
            currentText = newText;
            onUpdate(newText);
          }
        }),
        EditorView.theme({
          '&.cm-focused': {
            outline: 'none'
          },
          '&.cm-editor': {
            height: '100%'
          },
          '&.cm-scroller': {
            overflow: 'auto'
          }
        })
      ]
    });

  onMount(() => {
    const { code, mermaid } = validatedState.current;
    currentText = activeMode === 'code' ? code : mermaid;
    editorView = new EditorView({
      state: createDocument(currentText, activeMode === 'config'),
      parent: editorContainer
    });

    return () => {
      editorView?.destroy();
    };
  });

  $effect(() => {
    const { editorMode, code, mermaid } = validatedState.current;
    const text = editorMode === 'code' ? code : mermaid;
    if (!editorView) return;
    if (activeMode !== editorMode) {
      documents[activeMode] = editorView.state;
      activeMode = editorMode;
      editorView.setState(documents[editorMode] ?? createDocument(text, editorMode === 'config'));
      untrack(applyTheme);
    }
    currentText = text;
    if (editorView.state.doc.toString() !== text) {
      editorView.dispatch({
        changes: {
          from: 0,
          to: editorView.state.doc.length,
          insert: text
        }
      });
    }
  });
</script>

<div bind:this={editorContainer} class="size-full"></div>
