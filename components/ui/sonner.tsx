"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "light" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-white group-[.toaster]:text-gray-900 group-[.toaster]:border group-[.toaster]:border-gray-200 group-[.toaster]:shadow-lg",
          title: "text-gray-900",
          description: "text-gray-500",
          actionButton:
            "group-[.toast]:bg-[#00c065] group-[.toast]:text-white",
          cancelButton:
            "group-[.toast]:bg-gray-100 group-[.toast]:text-gray-700",
          closeButton:
            "group-[.toast]:bg-white group-[.toast]:border group-[.toast]:border-gray-200 group-[.toast]:text-gray-500 hover:group-[.toast]:text-gray-700",
          success:
            "group-[.toaster]:bg-white group-[.toaster]:text-gray-900 group-[.toaster]:border-green-500",
          error:
            "group-[.toaster]:bg-white group-[.toaster]:text-gray-900 group-[.toaster]:border-red-500",
          warning:
            "group-[.toaster]:bg-white group-[.toaster]:text-gray-900 group-[.toaster]:border-orange-500",
          info:
            "group-[.toaster]:bg-white group-[.toaster]:text-gray-900 group-[.toaster]:border-blue-500",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
