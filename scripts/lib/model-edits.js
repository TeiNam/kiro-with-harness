'use strict';

// 모델 식별자 라인 보존 변환(targeted line-preserving edit) 순수 함수 모듈.
// 설계 C1·C2: 에이전트 JSON / IDE 마크다운 프론트매터의 model 필드만 교체하고
// 나머지 바이트(들여쓰기·키 순서·공백·본문)는 그대로 보존한다.

/**
 * 변환 결과 표준 형태.
 * @typedef {Object} EditResult
 * @property {string} text     변환 후 텍스트(변경이 없으면 원문과 동일).
 * @property {boolean} changed model 값이 실제로 교체/삽입되었는지 여부.
 * @property {string} [reason] 변경하지 않은 경우의 사유
 *                             (예: 'missing-model-field', 'parse-failed').
 */

/**
 * 공백 문자(스페이스·탭·개행·캐리지리턴) 여부.
 * @param {string} ch 단일 문자.
 * @returns {boolean}
 */
function isWhitespace(ch) {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
}

/**
 * 최상위(root 객체 직속) `"model"` 키 문자열의 시작 인덱스(여는 따옴표 위치)를 찾는다.
 *
 * JSON.parse → stringify 재직렬화는 들여쓰기·키 순서·공백을 바꿔 바이트 보존(R1.5)을
 * 위반하므로 출력에 사용하지 않는다. 대신 텍스트를 문자 단위로 스캔하면서 중괄호·대괄호
 * 깊이(depth)를 추적하여 "오직 깊이 1(루트 객체 내부)에서 키 위치(뒤에 ':'가 오는)로
 * 등장하는 model 키"만 식별한다. 이렇게 하면 toolsSettings 등 중첩 객체 내부의 model
 * 유사 키를 절대 매칭하지 않는다(엣지 케이스: nested "model" keys).
 *
 * 문자열 리터럴 내부의 중괄호/따옴표는 무시하며 백슬래시 이스케이프도 처리한다.
 *
 * @param {string} text 원본 JSON 텍스트.
 * @returns {number} 최상위 model 키 여는 따옴표의 인덱스. 없으면 -1.
 */
function findTopLevelModelKeyStart(text) {
  let inString = false;
  let escaped = false;
  let depth = 0;
  let stringStart = -1;
  const n = text.length;

  for (let i = 0; i < n; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
        // 방금 닫힌 문자열이 깊이 1의 키 위치(뒤에 ':')에 있는 'model'인지 확인.
        if (depth === 1) {
          const content = text.slice(stringStart + 1, i);
          if (content === 'model') {
            let j = i + 1;
            while (j < n && isWhitespace(text[j])) j++;
            if (text[j] === ':') {
              return stringStart; // 여는 따옴표 위치.
            }
          }
        }
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      stringStart = i;
    } else if (ch === '{' || ch === '[') {
      depth++;
    } else if (ch === '}' || ch === ']') {
      depth--;
    }
  }

  return -1;
}

/**
 * 에이전트 JSON 원문에서 최상위 `"model"` 필드 라인의 값만 교체한다.
 *
 * 동작 규칙(설계 C1):
 * - 최상위 `"model": "<값>"` 라인을 정규식으로 식별하여 값만 치환하고,
 *   들여쓰기·트레일링 콤마·줄바꿈 등 다른 바이트는 모두 보존한다.
 * - 최상위 `model` 필드가 없으면 텍스트를 변경하지 않고
 *   `{ changed: false, reason: 'missing-model-field' }`를 반환한다(R1.8).
 * - 치환 후 `JSON.parse`로 유효성을 검증한다. 실패하면 원문을 복원하고
 *   `{ changed: false, reason: 'parse-failed' }`를 반환한다(R1.6).
 *
 * 구현 노트:
 * - 먼저 JSON.parse로 입력의 유효성과 최상위 `model` 키 존재를 "확인(confirm)"한다.
 *   이는 위치 특정/확인 용도일 뿐이며 출력은 재직렬화하지 않는다(바이트 보존).
 * - 최상위 키 위치는 깊이 추적 스캔(findTopLevelModelKeyStart)으로 정확히 특정하여
 *   중첩 객체의 model 유사 키를 배제한다.
 * - 실제 값 치환은 그 키 위치에 앵커링한 정규식으로 수행하여 들여쓰기와
 *   트레일링 콤마를 보존한다.
 *
 * @param {string} rawText  원본 파일 텍스트.
 * @param {string} newModel 적용할 모델 식별자(예: 'claude-opus-4.8').
 * @returns {EditResult} 변환 결과.
 */
function applyModelToAgentJson(rawText, newModel) {
  // 1. 입력이 유효한 JSON인지, 최상위 model 키가 있는지 확인(LOCATE/CONFIRM 목적).
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (e) {
    // 입력 자체가 유효한 JSON이 아니면 안전하게 위치를 특정할 수 없으므로 변경하지 않는다.
    return { text: rawText, changed: false, reason: 'invalid-input-json' };
  }

  // 최상위 객체의 직속 model 키가 있어야 한다. 중첩 model 키는 대상이 아니다(R1.8).
  const hasTopLevelModel =
    parsed !== null &&
    typeof parsed === 'object' &&
    !Array.isArray(parsed) &&
    Object.prototype.hasOwnProperty.call(parsed, 'model');

  if (!hasTopLevelModel) {
    return { text: rawText, changed: false, reason: 'missing-model-field' };
  }

  // 2. 최상위 "model" 키의 위치를 깊이 추적 스캔으로 특정한다(중첩 키 배제).
  const keyStart = findTopLevelModelKeyStart(rawText);
  if (keyStart === -1) {
    // 파서는 top-level model을 보았지만 텍스트 스캔이 못 찾는 경우(예: 비문자열 값).
    return { text: rawText, changed: false, reason: 'missing-model-field' };
  }

  // 3. 키 위치에 앵커링한 정규식으로 값만 치환한다.
  //    `("model"\s*:\s*)` 캡처는 키·콜론·공백(개행 포함)을 보존하고,
  //    `"(?:[^"\\]|\\.)*"`는 이스케이프를 포함한 문자열 값 전체를 매칭한다.
  //    매칭 범위 밖의 들여쓰기(앞)·트레일링 콤마(뒤)는 그대로 보존된다.
  const tail = rawText.slice(keyStart);
  const valueRe = /^("model"\s*:\s*)"(?:[^"\\]|\\.)*"/;
  if (!valueRe.test(tail)) {
    // 값이 문자열 형태가 아니면(비정상 자산) 변경하지 않는다.
    return { text: rawText, changed: false, reason: 'missing-model-field' };
  }
  // 함수형 치환으로 newModel 내 특수문자($, 백슬래시 등)를 안전하게 처리한다.
  const newTail = tail.replace(valueRe, (_full, prefix) => prefix + JSON.stringify(String(newModel)));
  const newText = rawText.slice(0, keyStart) + newTail;

  // 4. 치환 후 JSON 유효성 검증. 실패 시 원문 복원(R1.6).
  try {
    const reparsed = JSON.parse(newText);
    if (reparsed.model !== String(newModel)) {
      return { text: rawText, changed: false, reason: 'parse-failed' };
    }
  } catch (e) {
    return { text: rawText, changed: false, reason: 'parse-failed' };
  }

  // changed는 실제 바이트 변경 여부를 반영한다(동일 값 적용 시 no-op 확인 → changed:false).
  return { text: newText, changed: newText !== rawText };
}

/**
 * 텍스트를 줄 단위로 분해하되 각 줄의 종결자(EOL)를 그대로 보존한다.
 *
 * `lines.map(l => l.content + l.eol).join('')`가 원본 텍스트를 바이트 단위로
 * 정확히 재구성하도록 설계되었다. content에는 EOL이 포함되지 않으므로
 * CRLF의 `\r`도 content가 아닌 eol 쪽에 보관된다(라인 내용 비교 시 `\r` 오염 방지).
 *
 * @param {string} text 원본 텍스트.
 * @returns {{content: string, eol: string}[]} 줄 목록(eol은 '\n'|'\r\n'|'\r'|'').
 */
function splitLinesPreserve(text) {
  const lines = [];
  const n = text.length;
  let start = 0;
  let i = 0;

  while (i < n) {
    const ch = text[i];
    if (ch === '\n') {
      lines.push({ content: text.slice(start, i), eol: '\n' });
      i += 1;
      start = i;
    } else if (ch === '\r') {
      if (i + 1 < n && text[i + 1] === '\n') {
        lines.push({ content: text.slice(start, i), eol: '\r\n' });
        i += 2;
      } else {
        lines.push({ content: text.slice(start, i), eol: '\r' });
        i += 1;
      }
      start = i;
    } else {
      i += 1;
    }
  }

  // 마지막 EOL 없는 잔여 세그먼트(있으면)를 추가한다.
  if (start < n) {
    lines.push({ content: text.slice(start), eol: '' });
  }

  return lines;
}

/**
 * 줄 내용의 선행 공백(스페이스·탭) 폭을 센다. 블록 스칼라 연속 줄 판정에 쓴다.
 * @param {string} content EOL을 제외한 줄 내용.
 * @returns {number} 선행 공백 문자 수.
 */
function leadingIndentWidth(content) {
  let w = 0;
  while (w < content.length && (content[w] === ' ' || content[w] === '\t')) {
    w += 1;
  }
  return w;
}

/**
 * `description:` 뒤의 값이 YAML 블록 스칼라 지시자(`|`, `>` 및 그 변형)인지 판정한다.
 * 예: `|`, `|-`, `|+`, `|2`, `>`, `>-` (뒤에 주석 허용).
 * @param {string} value 콜론 뒤 값 부분(트레일링 공백 제거됨).
 * @returns {boolean}
 */
function isBlockScalarValue(value) {
  return /^[|>][+-]?\d*\s*(#.*)?$/.test(value);
}

/**
 * IDE 에이전트 마크다운 프론트매터(YAML)에 `model:` 라인을 적용한다.
 *
 * 동작 규칙(설계 C2):
 * - 프론트매터에 이미 `model:` 라인이 있으면 값만 라인 보존 치환한다.
 * - 없으면 프론트매터 블록의 `description:` 라인 바로 다음 줄에
 *   `model: <식별자>` 한 줄을 삽입한다.
 * - name·description·tools 등 그 외 프론트매터 필드와 마크다운 본문은
 *   바이트 단위로 보존한다(R6.7).
 * - 프론트매터 블록 자체가 없으면 변경하지 않고
 *   `{ changed: false, reason: 'missing-frontmatter' }`를 반환한다.
 *
 * 프론트매터 탐지: BOM 허용 후 첫 줄이 `---`(트레일링 공백 허용)여야 하며,
 * 그 다음으로 등장하는 첫 `---` 줄을 닫는 구분자로 본다. 본문의 수평선(`---`)은
 * 닫는 구분자 이후에 위치하므로 프론트매터로 오인되지 않는다.
 *
 * 삽입 위치 결정(결정적):
 *   1) 기존 `model:` 라인이 있으면 → 값만 치환.
 *   2) 없고 `description:` 라인이 있으면 → 그 라인 바로 다음에 삽입.
 *      (블록 스칼라 description이면 그 연속 줄들 다음에 삽입해 YAML 유효성 보존.)
 *   3) description이 없으면 → 프론트매터 블록의 마지막 줄(닫는 `---` 직전)에 삽입.
 *      name 라인 다음이 아니라 블록 끝에 삽입하는 쪽을 택한다(결정적·단순).
 *
 * @param {string} rawText  원본 마크다운 텍스트.
 * @param {string} newModel 적용할 모델 식별자.
 * @returns {EditResult} 변환 결과.
 */
function applyModelToFrontmatter(rawText, newModel) {
  if (typeof rawText !== 'string') {
    return { text: rawText, changed: false, reason: 'missing-frontmatter' };
  }

  // BOM은 프리픽스로 분리해 보존하고, 탐지는 BOM 제거본에서 수행한다.
  let bom = '';
  let body = rawText;
  if (body.charCodeAt(0) === 0xfeff) {
    bom = body[0];
    body = body.slice(1);
  }

  const lines = splitLinesPreserve(body);

  // 여는 구분자: 첫 줄이 정확히 `---`(트레일링 공백 허용)이어야 한다.
  if (lines.length === 0 || !/^---\s*$/.test(lines[0].content)) {
    return { text: rawText, changed: false, reason: 'missing-frontmatter' };
  }

  // 닫는 구분자: 첫 줄 이후 처음 등장하는 `---` 줄.
  let closeIndex = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (/^---\s*$/.test(lines[i].content)) {
      closeIndex = i;
      break;
    }
  }
  if (closeIndex === -1) {
    // 여는 구분자만 있고 닫는 구분자가 없으면 완전한 프론트매터가 아니다.
    return { text: rawText, changed: false, reason: 'missing-frontmatter' };
  }

  const value = String(newModel);
  const modelKeyRe = /^[ \t]*model[ \t]*:(?=[ \t]|$)/; // 'model' 키 정확 매칭(models: 등 배제)
  const modelPrefixRe = /^([ \t]*model[ \t]*:[ \t]*)(.*)$/; // group1=값 직전까지의 프리픽스
  const descLineRe = /^([ \t]*)description[ \t]*:[ \t]*(.*)$/;

  // 1) 기존 model 라인 탐색(프론트매터 블록 내부). 있으면 값만 치환.
  for (let i = 1; i < closeIndex; i += 1) {
    if (modelKeyRe.test(lines[i].content)) {
      const m = lines[i].content.match(modelPrefixRe);
      if (m) {
        lines[i] = { content: m[1] + value, eol: lines[i].eol };
        const newText = bom + lines.map((l) => l.content + l.eol).join('');
        return { text: newText, changed: newText !== rawText };
      }
    }
  }

  // 2) description 라인 탐색.
  let descIdx = -1;
  let descIndent = '';
  let descIsBlock = false;
  for (let i = 1; i < closeIndex; i += 1) {
    const dm = lines[i].content.match(descLineRe);
    if (dm) {
      descIdx = i;
      descIndent = dm[1];
      descIsBlock = isBlockScalarValue(dm[2].replace(/[ \t]+$/, ''));
      break;
    }
  }

  let insertAfter;
  let insertIndent;
  if (descIdx !== -1) {
    insertIndent = descIndent;
    if (descIsBlock) {
      // 블록 스칼라 연속 줄(공백 줄 또는 키보다 더 들여쓴 줄)을 건너뛴 뒤 삽입.
      const keyIndent = leadingIndentWidth(lines[descIdx].content);
      let j = descIdx + 1;
      while (j < closeIndex) {
        const c = lines[j].content;
        if (c.trim() === '' || leadingIndentWidth(c) > keyIndent) {
          j += 1;
        } else {
          break;
        }
      }
      insertAfter = j - 1;
    } else {
      insertAfter = descIdx;
    }
  } else {
    // 3) description이 없으면 프론트매터 블록 마지막 줄(닫는 `---` 직전)에 삽입.
    insertAfter = closeIndex - 1; // 빈 프론트매터면 여는 구분자(인덱스 0).
    insertIndent = ''; // 프론트매터 키는 통상 들여쓰기 0.
  }

  // 삽입 줄의 EOL은 기준 줄의 EOL을 따른다(없으면 '\n').
  const eol = lines[insertAfter].eol || '\n';
  const newLine = { content: insertIndent + 'model: ' + value, eol };
  lines.splice(insertAfter + 1, 0, newLine);

  const newText = bom + lines.map((l) => l.content + l.eol).join('');
  return { text: newText, changed: newText !== rawText };
}

module.exports = {
  applyModelToAgentJson,
  applyModelToFrontmatter,
};
