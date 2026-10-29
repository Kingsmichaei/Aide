import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn, initials } from "@/lib/utils";

export function UserAvatar({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  return (
    <Avatar className={cn("size-8", className)}>
      <AvatarFallback className="bg-primary-soft text-xs font-semibold text-primary-soft-foreground">
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
