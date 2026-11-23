"use client";
import { useSignedUrl } from "@/lib/hooks";
import { Avatar } from "@/components/ui/misc";

export function StudentAvatar({ name, path, size = 40, className }: { name?: string | null; path?: string | null; size?: number; className?: string }) {
  const url = useSignedUrl(path);
  return <Avatar name={name} src={url} size={size} className={className} />;
}
