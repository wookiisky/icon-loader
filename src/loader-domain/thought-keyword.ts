/** 可用于图标匹配的 thinking 关键词。 */
export type ThoughtKeyword = {
  /** 原始清洗后的关键词。 */
  value: string;
  /** 匹配用规范化关键词。 */
  normalizedValue: string;
};

/** 流式 thought 关键词提取状态，避免半截词和重复事件刷屏。 */
export type ThoughtKeywordExtractorState = {
  /** 上一个流式片段末尾尚未确认完整的 token。 */
  pendingText: string;
  /** 当前请求中最近已经发出的关键词。 */
  recentKeywords: string[];
  /** 当前请求已发出关键词数量。 */
  emittedCount: number;
};

/** 关键词提取结果。 */
export type ThoughtKeywordExtractionResult = {
  /** 更新后的提取状态。 */
  state: ThoughtKeywordExtractorState;
  /** 本次新提取出的关键词。 */
  keywords: ThoughtKeyword[];
};

const maxPendingTextLength = 64;
const maxRecentKeywords = 32;
const maxKeywordsPerRequest = 40;
const maxKeywordsPerChunk = 8;
const minKeywordLength = 2;
const maxKeywordLength = 32;

const stopWords = new Set([
  "and",
  "are",
  "but",
  "can",
  "for",
  "from",
  "how",
  "into",
  "the",
  "then",
  "this",
  "that",
  "with",
  "需要",
  "然后",
  "可以",
  "这个",
  "一个",
  "进行",
  "分析",
  "考虑",
]);

/** 创建单次请求内使用的关键词提取状态。 */
export function createThoughtKeywordExtractorState(): ThoughtKeywordExtractorState {
  return {
    pendingText: "",
    recentKeywords: [],
    emittedCount: 0,
  };
}

/** 追加一段 thought 文本并提取已完整出现的关键词。 */
export function appendThoughtTextAndExtractKeywords(
  state: ThoughtKeywordExtractorState,
  text: string,
): ThoughtKeywordExtractionResult {
  const mergedText = `${state.pendingText}${text}`;
  const { completeText, pendingText } = splitCompleteThoughtText(mergedText);
  return extractKeywordsFromCompleteText(state, completeText, pendingText);
}

/** 在流结束时冲洗最后一个无标点结尾的关键词。 */
export function flushThoughtKeywordExtractor(state: ThoughtKeywordExtractorState): ThoughtKeywordExtractionResult {
  return extractKeywordsFromCompleteText(state, state.pendingText, "");
}

/** 将关键词规范化为匹配键。 */
export function normalizeThoughtKeyword(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^\p{Letter}\p{Number}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 把完整文本片段转为关键词，并返回新的流式状态。 */
function extractKeywordsFromCompleteText(
  state: ThoughtKeywordExtractorState,
  completeText: string,
  pendingText: string,
): ThoughtKeywordExtractionResult {
  const recentKeywordSet = new Set(state.recentKeywords);
  const keywords: ThoughtKeyword[] = [];
  const candidates = tokenizeThoughtText(completeText);

  for (const candidate of candidates) {
    if (state.emittedCount + keywords.length >= maxKeywordsPerRequest || keywords.length >= maxKeywordsPerChunk) {
      break;
    }

    const normalizedValue = normalizeThoughtKeyword(candidate);
    if (!isValidKeyword(normalizedValue) || recentKeywordSet.has(normalizedValue)) {
      continue;
    }

    recentKeywordSet.add(normalizedValue);
    keywords.push({
      value: normalizedValue,
      normalizedValue,
    });
  }

  const recentKeywords = [...state.recentKeywords, ...keywords.map((keyword) => keyword.normalizedValue)].slice(
    -maxRecentKeywords,
  );

  return {
    state: {
      pendingText: pendingText.slice(-maxPendingTextLength),
      recentKeywords,
      emittedCount: state.emittedCount + keywords.length,
    },
    keywords,
  };
}

/** 将文本分为已完成部分和末尾可能仍在流式拼接的 token。 */
function splitCompleteThoughtText(text: string): { completeText: string; pendingText: string } {
  const match = /([\p{Letter}\p{Number}_-]+)$/u.exec(text);
  if (match === null || match.index === undefined) {
    return {
      completeText: text,
      pendingText: "",
    };
  }

  return {
    completeText: text.slice(0, match.index),
    pendingText: match[1],
  };
}

/** 从文本中提取中英文 token 候选。 */
function tokenizeThoughtText(text: string): string[] {
  const tokens = text.match(/[\p{Script=Han}]{2,}|[a-zA-Z][a-zA-Z0-9_-]{1,31}/gu);
  return tokens ?? [];
}

/** 判断规范化 token 是否适合进入可视化队列。 */
function isValidKeyword(keyword: string): boolean {
  if (keyword.length < minKeywordLength || keyword.length > maxKeywordLength) {
    return false;
  }

  if (stopWords.has(keyword)) {
    return false;
  }

  return /[\p{Letter}\p{Number}]/u.test(keyword);
}
