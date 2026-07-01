export default function Placeholder({ title }: { title: string }) {
  return (
    <div className="space-y-2">
      <h1 className="text-xl font-bold text-slate-800">{title}</h1>
      <p className="text-sm text-slate-400">
        ส่วนนี้จะถูกย้ายมาจากไฟล์ HTML เดิมในเฟสถัดไป
      </p>
    </div>
  )
}
