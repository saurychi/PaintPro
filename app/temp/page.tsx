import Image from "next/image";

function Temp() {
  return (
    <div className="min-h-svh flex items-center justify-center bg-white px-6">
          <div className="flex flex-col items-center gap-8 text-center">

            {/* Bigger PaintPro Logo */}
            <div className="flex flex-col items-center gap-3">
              <Image
                src="/paint_pro_logo.png"
                alt="PaintPro Logo"
                width={100}
                height={100}
                priority
                className="object-contain"
              />
              <span className="text-3xl font-semibold text-gray-900">
                PaintPro
              </span>
            </div>

            {/* Spinner */}
            <div className="flex flex-col items-center gap-4">
              <div className="h-12 w-12 rounded-full border-4 border-gray-200 border-t-[#00c065] animate-spin" />
              <p className="text-sm text-gray-600">
                Completing Google sign in...
              </p>
            </div>
          </div>
        </div>
  )
}

export default Temp
