import { FormEvent, KeyboardEvent as ReactKeyboardEvent, useState } from "react";

type PromptFormProps = {
  disabled: boolean;
  onSubmit: (prompt: string) => void;
};

/** 用户输入区，提交前只做轻量交互控制，核心校验交给状态层。 */
export function PromptForm({ disabled, onSubmit }: PromptFormProps) {
  const [prompt, setPrompt] = useState("");

  function submitPrompt(): void {
    onSubmit(prompt);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    submitPrompt();
  }

  function handleInputKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>): void {
    if (disabled || event.key !== "Enter" || event.shiftKey || isComposingText(event)) {
      return;
    }

    event.preventDefault();
    submitPrompt();
  }

  /** 输入法候选词确认也会触发 Enter，合成态不能当作提交。 */
  function isComposingText(event: ReactKeyboardEvent<HTMLTextAreaElement>): boolean {
    const nativeEvent = event.nativeEvent as globalThis.KeyboardEvent & { isComposing?: boolean };
    return nativeEvent.isComposing === true;
  }

  return (
    <form className="prompt-form" onSubmit={handleSubmit}>
      <textarea
        aria-label="输入问题"
        className="prompt-input"
        disabled={disabled}
        id="prompt"
        name="prompt"
        onChange={(event) => setPrompt(event.target.value)}
        onKeyDown={handleInputKeyDown}
        placeholder="输入问题，观察等待动画..."
        rows={3}
        value={prompt}
      />
      <button className="submit-button" disabled={disabled} type="submit">
        {disabled ? "生成中" : "提交"}
      </button>
    </form>
  );
}
