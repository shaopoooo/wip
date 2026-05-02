export interface ParsedProcessStep {
  order: number
  orderStr: string
  stationCode?: string // Usually something like A004 or A015
  stationName: string // e.g. CNC, 線路, LPI
  description: string // e.g. 使用YA161A...程式
}

export interface ParsedRtfResult {
  modelNumber: string | null
  name: string | null
  rawText: string
  steps: ParsedProcessStep[]
}

/**
 * Parses RTF text exported from the ERP and extracts Work Order / Process Route info.
 */
export function parseRtfContent(content: string): ParsedRtfResult {
  const blocks = content.split('\\shptxt')
  blocks.shift() 

  const ignoreWords = new Set([
    'pard', 'plain', 'nowidctlpar', 'ql', 'qj', 'li0', 'ri0', 'aspalpha', 
    'faauto', 'lang1028', 'langfe1028', 'fs28', 'fs23', 'fs22', 'fs19', 
    'fs17', 'fs16', 'cf1', 'expnd0', 'expndtw3', 'expndtw5', 'b', 'ul', 'f1', 'v', 'par'
  ])

  let extractedText = ""

  for (const block of blocks) {
    const textPart = block.split('}}')[0] || ""
    const chars: string[] = []
    const regex = /\\u(-?\d+)\s?\??|([A-Za-z0-9:/\-".]+)/g
    let match
    while ((match = regex.exec(textPart)) !== null) {
      if (match[1]) {
        let val = parseInt(match[1], 10)
        if (val < 0) val += 65536
        chars.push(String.fromCharCode(val))
      } else if (match[2]) {
        const w = match[2]
        if (ignoreWords.has(w) || w.startsWith('fs') || w.startsWith('cf') || w.startsWith('lang')) {
          continue
        }
        chars.push(w)
      }
    }
    const cleanStr = chars.join('').trim()
    if (cleanStr) {
      extractedText += cleanStr + " "
    }
  }

  let modelNumber: string | null = null
  let name: string | null = null

  const rawText = extractedText

  const modelMatch = rawText.match(/([A-Z]{2}\d{3}[A-Z]\d{3}[A-Z])/i)
  if (modelMatch) modelNumber = modelMatch[1]

  const nameMatch = rawText.match(/物料名稱[:\s]*([A-Z0-9.\-Rev]+)/i) || rawText.match(/3210041000-RRev\.B/)
  if (nameMatch) name = nameMatch[1] ? nameMatch[1].trim() : "3210041000-RRev.B"

  const formattedRawText = rawText
    .replace(/(製程單號|單據日期|製令單號|預計完工日期|物料編號|物料名稱|製單人員|生產數量|單據備註|核　准|審　核|工程師|經　辦)[:：\s]*/g, '\n\n[$1] ')
    .replace(/\b([A-Z]{1,2}\d{2,4})\s+([\u4e00-\u9fa5A-Za-z/]+(?:股份有限公司|企業社|實業社|實業股份有限公司)?)\s+/g, '\n$1 $2  ')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  const steps: any[] = []
  
  // Regex to match: Code Name Description Order
  // Use (?:\s+|^) at start to ensure we are matching from beginning of line (or beginning of string)
  // Use \s+(\d{2}(?:-\d)?)(?:\s|$) to ensure order has space before it and space/eol after it.
  const stepRegex = /^([A-Z]{1,2}\d{2,4})\s+([\u4e00-\u9fa5A-Za-z/]+(?:股份有限公司|企業社|實業社|實業股份有限公司)?)(?:\s+(.*?))?\s+(\d{2}(?:-\d)?)(?:\s|$)/gm
  
  let stepMatch
  while ((stepMatch = stepRegex.exec(formattedRawText)) !== null) {
    const code = stepMatch[1]
    const stationName = stepMatch[2]
    const description = stepMatch[3] ? stepMatch[3].trim() : ""
    const orderStr = stepMatch[4]
    
    // Parse order as float to handle 01-1 as 1.1 so it sorts correctly
    const order = parseFloat(orderStr.replace('-', '.'))

    if (!steps.find(s => s.order === order)) {
      steps.push({
        order,
        orderStr,
        stationCode: code,
        stationName,
        description: description.substring(0, 500).trim()
      })
    }
  }

  return { 
    modelNumber, 
    name, 
    rawText: formattedRawText,
    steps: steps.sort((a,b)=>a.order-b.order) 
  }
}
