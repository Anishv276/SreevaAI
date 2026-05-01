import * as React from "react"
import { cn } from "@/lib/utils"

export interface InputProps
    extends React.InputHTMLAttributes<HTMLInputElement> { }

const Input = React.forwardRef<HTMLInputElement, InputProps>(
    ({ className, type, ...props }, ref) => {
        const handleWheel: React.WheelEventHandler<HTMLInputElement> = (event) => {
            if (type === "number") {
                event.currentTarget.blur();
            }
            props.onWheel?.(event);
        };

        return (
            <input
                type={type}
                className={cn(
                    "flex h-9 w-full rounded-md border border-gray-200 bg-white px-3 py-1 text-sm text-gray-900 shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#F97316] disabled:cursor-not-allowed disabled:opacity-50",
                    className
                )}
                ref={ref}
                onWheel={handleWheel}
                {...props}
            />
        )
    }
)
Input.displayName = "Input"

export { Input }

