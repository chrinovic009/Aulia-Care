import { ReactNode } from "react";

interface ButtonProps {
  children: ReactNode; // Button text or content
  size?: "sm" | "md"; // Button size
  type?: "button" | "submit" | "reset";
  variant?: "primary" | "outline" | "secondary" | "danger";
  startIcon?: ReactNode; // Icon before the text
  endIcon?: ReactNode; // Icon after the text
  onClick?: () => void; // Click handler
  disabled?: boolean; // Disabled state
  className?: string; // Disabled state
}

const Button: React.FC<ButtonProps> = ({
  children,
  size = "md",
  variant = "primary",
  startIcon,
  endIcon,
  onClick,
  className = "",
  disabled = false,
  type = "button",
}) => {
  // Size Classes
  const sizeClasses = {
    sm: "min-h-10 px-4 py-2.5 text-sm",
    md: "min-h-11 px-5 py-3 text-sm",
  };

  // Variant Classes
  const variantClasses = {
    primary:
      "bg-brand-600 text-white shadow-theme-xs hover:bg-brand-700 focus-visible:ring-brand-500/30 disabled:bg-brand-300",
    outline:
      "bg-white text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:bg-[#0a1d3a] dark:text-gray-200 dark:ring-[#1c4648] dark:hover:bg-[#102b3c] dark:hover:text-white",
    secondary:
      "bg-brand-50 text-brand-800 ring-1 ring-inset ring-brand-200 hover:bg-brand-100 dark:bg-brand-500/15 dark:text-brand-200 dark:ring-brand-500/30 dark:hover:bg-brand-500/25",
    danger:
      "bg-error-600 text-white shadow-theme-xs hover:bg-error-700 focus-visible:ring-error-500/30 disabled:bg-error-300",
  };

  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition focus-visible:outline-none focus-visible:ring-4 ${className} ${
        sizeClasses[size]
      } ${variantClasses[variant]} ${
        disabled ? "cursor-not-allowed opacity-50" : ""
      }`}
      onClick={onClick}
      disabled={disabled}
    >
      {startIcon && <span className="flex items-center">{startIcon}</span>}
      {children}
      {endIcon && <span className="flex items-center">{endIcon}</span>}
    </button>
  );
};

export default Button;
