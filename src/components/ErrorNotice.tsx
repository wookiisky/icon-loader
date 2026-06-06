import type { AppRequestState } from "../app/app-state";

type ErrorNoticeProps = {
  state: AppRequestState;
};

/** 错误提示区，只展示用户可理解的信息，不暴露服务端堆栈。 */
export function ErrorNotice({ state }: ErrorNoticeProps) {
  if (state.kind !== "error") {
    return null;
  }

  return (
    <div className="error-notice" role="alert">
      {state.message}
    </div>
  );
}
