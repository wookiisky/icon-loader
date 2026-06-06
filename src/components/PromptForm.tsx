import { FormEvent, useState } from "react";

type PromptFormProps = {
  disabled: boolean;
  onSubmit: (prompt: string) => void;
};

/** 用户输入区，提交前只做轻量交互控制，核心校验交给状态层。 */
export function PromptForm({ disabled, onSubmit }: PromptFormProps) {
  const [prompt, setPrompt] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit(prompt);
  }

  return (
    <form className="prompt-form" onSubmit={handleSubmit}>
      <textarea
        aria-label="输入问题"
        className="prompt-input"
        disabled={disabled}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder="输入一个问题，观察等待时的 Loader 动画..."
        rows={5}
        value={prompt}
      />
      <button className="submit-button" disabled={disabled} type="submit">
        {disabled ? "生成中" : "提交"}
      </button>
    </form>
  );
}
