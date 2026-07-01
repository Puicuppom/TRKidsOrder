import * as pdfjsLib from 'pdfjs-dist'
// โหลด worker ของ pdf.js ผ่าน Vite (?url) — เสถียรกว่าใช้ CDN
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl

export { pdfjsLib }
