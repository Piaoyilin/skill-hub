import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCount(value: number) {
  if (value >= 10000) {
    return `${(value / 10000).toFixed(1).replace(".0", "")} 万`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1).replace(".0", "")}k`;
  }
  return value.toLocaleString("zh-CN");
}
