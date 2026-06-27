import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
    "inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-semibold ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
    {
        variants: {
            variant: {
                default:
                    "text-white shadow-md hover:shadow-lg hover:-translate-y-px",
                destructive:
                    "bg-red-500 text-white hover:bg-red-600 shadow-sm",
                outline:
                    "border bg-white hover:bg-violet-50 hover:text-violet-700 hover:border-violet-200",
                secondary:
                    "bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100 hover:text-gray-900",
                ghost:
                    "hover:bg-violet-50 hover:text-violet-700",
                link:
                    "text-violet-600 underline-offset-4 hover:underline",
                premium:
                    "text-white shadow-lg hover:shadow-xl hover:-translate-y-px",
                success:
                    "bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm",
            },
            size: {
                default: "h-11 px-5 py-2",
                sm:      "h-9 rounded-lg px-3.5 text-xs",
                lg:      "h-12 rounded-xl px-7 text-base",
                icon:    "h-10 w-10",
            },
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    }
)

export interface ButtonProps
    extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
    asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant, size, asChild = false, style, ...props }, ref) => {
        const Comp = asChild ? Slot : "button";

        // Apply gradient styles for gradient variants
        const gradientStyle: React.CSSProperties =
            variant === "default" || variant === undefined
                ? { background: "linear-gradient(135deg, #8B5CF6 0%, #3B82F6 100%)", boxShadow: "0 4px 14px rgba(124, 58, 237, 0.3)", ...style }
                : variant === "premium"
                ? { background: "linear-gradient(135deg, #7C3AED 0%, #2563EB 100%)", boxShadow: "0 4px 20px rgba(124, 58, 237, 0.35)", ...style }
                : style ?? {};

        return (
            <Comp
                className={cn(buttonVariants({ variant, size, className }))}
                ref={ref}
                style={gradientStyle}
                {...props}
            />
        )
    }
)
Button.displayName = "Button"
export { Button, buttonVariants }
