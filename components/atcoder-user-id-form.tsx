"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";

import { updateAtCoderUserId } from "@/app/settings/actions";

function normalizeAtCoderUserId(value: string): string {
  return value.trim().toLowerCase();
}

type AtCoderUserIdFormProps = {
  currentAtCoderUserId?: string | null;
};

export function AtCoderUserIdForm({ currentAtCoderUserId }: AtCoderUserIdFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const skipConfirmRef = useRef(false);
  const [value, setValue] = useState(currentAtCoderUserId ?? "");
  const [showConfirm, setShowConfirm] = useState(false);

  const currentValue = useMemo(
    () => normalizeAtCoderUserId(currentAtCoderUserId ?? ""),
    [currentAtCoderUserId],
  );
  const nextValue = normalizeAtCoderUserId(value);
  const needsConfirmation = currentValue !== nextValue;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (skipConfirmRef.current) {
      skipConfirmRef.current = false;
      return;
    }

    if (!needsConfirmation) {
      return;
    }

    event.preventDefault();
    setShowConfirm(true);
  };

  const confirmChange = () => {
    setShowConfirm(false);
    skipConfirmRef.current = true;
    formRef.current?.requestSubmit();
  };

  return (
    <>
      <form ref={formRef} action={updateAtCoderUserId} onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex w-full flex-col gap-1 text-sm">
          <span>AtCoder User ID</span>
          <input
            type="text"
            name="atcoderUserId"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="例: tourist"
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
          />
        </label>
        <button
          type="submit"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          保存
        </button>
      </form>

      {showConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
            <h3 className="text-lg font-semibold">AtCoder ID を変更しますか？</h3>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              変更すると、今までの記録データ（3分類）は削除され、新しい ID で同期を開始します。
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="rounded-md border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={confirmChange}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500"
              >
                変更して保存
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}