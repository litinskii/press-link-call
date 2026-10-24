import { useEffect, useState } from "react";
import type { Getter } from "@moq/signals";

export function useSignalMap<K, V>(signal: Getter<Map<K, V>>): Map<K, V> {
  const [value, setValue] = useState(() => new Map(signal.peek()));

  useEffect(
    () => signal.subscribe((next) => setValue(new Map(next))),
    [signal],
  );

  return value;
}
