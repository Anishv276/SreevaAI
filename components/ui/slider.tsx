import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"
import { cn } from "@/lib/utils"
const Slider = React.forwardRef<
    React.ElementRef<typeof SliderPrimitive.Root>,
    React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
    <SliderPrimitive.Root
        ref={ref}
        className={cn(
            "relative flex w-full touch-none select-none items-center py-2.5 cursor-pointer",
            className
        )}
        {...props}
    >
        <SliderPrimitive.Track
            className="relative h-2.5 w-full grow overflow-hidden rounded-full bg-violet-100/80 border border-violet-200/50"
        >
            <SliderPrimitive.Range className="absolute h-full rounded-full bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 shadow-[0_0_10px_rgba(124,58,237,0.35)]" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb
            className="block h-5 w-5 rounded-full border-2 border-violet-600 bg-white shadow-[0_2px_8px_rgba(124,58,237,0.3)] ring-offset-background transition-all hover:scale-125 hover:shadow-[0_0_14px_rgba(124,58,237,0.5)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-violet-500/20 cursor-grab active:cursor-grabbing active:scale-110"
        />
    </SliderPrimitive.Root>
))
Slider.displayName = SliderPrimitive.Root.displayName
export { Slider }
