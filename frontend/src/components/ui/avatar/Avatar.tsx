import { useMemo, useState } from "react";

interface AvatarProps {
  src?: string | null; // URL of the avatar image
  alt?: string; // Alt text for the avatar
  initials?: string; // Initials fallback when no image is available
  size?: "xsmall" | "small" | "medium" | "large" | "xlarge" | "xxlarge"; // Avatar size
  status?: "online" | "offline" | "busy" | "none"; // Status indicator
}

const sizeClasses = {
  xsmall: "h-6 w-6 max-w-6",
  small: "h-8 w-8 max-w-8",
  medium: "h-10 w-10 max-w-10",
  large: "h-12 w-12 max-w-12",
  xlarge: "h-14 w-14 max-w-14",
  xxlarge: "h-16 w-16 max-w-16",
};

const statusSizeClasses = {
  xsmall: "h-1.5 w-1.5 max-w-1.5",
  small: "h-2 w-2 max-w-2",
  medium: "h-2.5 w-2.5 max-w-2.5",
  large: "h-3 w-3 max-w-3",
  xlarge: "h-3.5 w-3.5 max-w-3.5",
  xxlarge: "h-4 w-4 max-w-4",
};

const statusColorClasses = {
  online: "bg-success-500",
  offline: "bg-error-400",
  busy: "bg-warning-500",
};

const getInitials = (text: string) => {
  const words = text
    .trim()
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase());
  return words.join("") || "U";
};

const Avatar: React.FC<AvatarProps> = ({
  src,
  alt = "User Avatar",
  initials,
  size = "medium",
  status = "none",
}) => {
  const [imageError, setImageError] = useState(false);
  const hasImage = Boolean(src) && !imageError;

  const fallbackInitials = useMemo(() => {
    if (initials) {
      return initials.toUpperCase();
    }
    return getInitials(alt || "User Avatar");
  }, [alt, initials]);

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden rounded-full bg-slate-200 text-sm font-semibold uppercase text-slate-800 dark:bg-slate-700 dark:text-slate-100 ${sizeClasses[size]}`}
    >
      {/* Avatar Image */}
      {hasImage ? (
        <img
          src={src!}
          alt={alt}
          className="h-full w-full object-cover"
          onError={() => setImageError(true)}
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-base font-semibold">
          {fallbackInitials}
        </span>
      )}

      {/* Status Indicator */}
      {status !== "none" && (
        <span
          className={`absolute bottom-0 right-0 rounded-full border-[1.5px] border-white dark:border-gray-900 ${
            statusSizeClasses[size]
          } ${statusColorClasses[status] || ""}`}
        ></span>
      )}
    </div>
  );
};

export default Avatar;
