import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PromptForm } from "../../src/components/PromptForm";

/** 渲染可输入的 PromptForm 测试夹具。 */
function renderPromptForm(disabled = false) {
  const onSubmit = vi.fn();
  render(<PromptForm disabled={disabled} onSubmit={onSubmit} />);
  const input = screen.getByLabelText("输入问题");

  return {
    input,
    onSubmit,
  };
}

/** 派发带输入法合成态的 Enter 键事件。 */
function fireComposingEnter(input: HTMLElement): boolean {
  const event = new KeyboardEvent("keydown", {
    key: "Enter",
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(event, "isComposing", {
    configurable: true,
    value: true,
  });

  return input.dispatchEvent(event);
}

describe("PromptForm", () => {
  it("输入框普通回车会发送当前内容", () => {
    const { input, onSubmit } = renderPromptForm();

    fireEvent.change(input, { target: { value: "解释数据库索引" } });
    const notPrevented = fireEvent.keyDown(input, { key: "Enter" });

    expect(notPrevented).toBe(false);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith("解释数据库索引");
  });

  it("Shift 加回车保留换行能力，不触发发送", () => {
    const { input, onSubmit } = renderPromptForm();

    fireEvent.change(input, { target: { value: "第一行" } });
    const notPrevented = fireEvent.keyDown(input, { key: "Enter", shiftKey: true });

    expect(notPrevented).toBe(true);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("输入法合成态回车只确认候选词，不触发发送", () => {
    const { input, onSubmit } = renderPromptForm();

    fireEvent.change(input, { target: { value: "中文" } });
    const notPrevented = fireComposingEnter(input);

    expect(notPrevented).toBe(true);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("禁用态回车不会绕过按钮禁用状态发送", () => {
    const { input, onSubmit } = renderPromptForm(true);

    fireEvent.keyDown(input, { key: "Enter" });

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
