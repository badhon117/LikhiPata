/* ============================================================
   আমার খাতা — Formula Engine (Fully Fixed)
   - সঠিক function argument handling
   - বাংলা সংখ্যা সমর্থন
   - Variable existence validation
   - % অপারেটর: user context-এ percent হিসেবে কাজ করবে
   ============================================================ */

/* ============ টোকেনাইজার ============ */
function tokenize(expr) {
  const tokens = [];
  let i = 0;
  const s = String(expr);

  while (i < s.length) {
    const c = s[i];

    if (/\s/.test(c)) { i++; continue; }

    // সংখ্যা (ইংরেজি + বাংলা)
    if (/[0-9.\u09E6-\u09EF]/.test(c)) {
      let num = '';
      while (i < s.length && /[0-9.\u09E6-\u09EF]/.test(s[i])) {
        const ch = s[i];
        const bnIdx = '০১২৩৪৫৬৭৮৯'.indexOf(ch);
        num += bnIdx >= 0 ? bnIdx : ch;
        i++;
      }
      tokens.push({ type: 'number', value: parseFloat(num) });
      continue;
    }

    // ফাংশন / ভ্যারিয়েবল নাম (ইংরেজি + বাংলা)
    if (/[a-zA-Z_\u0980-\u09FF]/.test(c)) {
      let name = '';
      while (i < s.length && /[a-zA-Z0-9_\u0980-\u09FF]/.test(s[i])) { name += s[i]; i++; }
      if (i < s.length && s[i] === '(') {
        tokens.push({ type: 'func', value: name.toLowerCase() });
      } else {
        tokens.push({ type: 'var', value: name });
      }
      continue;
    }

    if ('+-*/%(),'.includes(c)) {
      tokens.push({ type: 'op', value: c });
      i++;
      continue;
    }

    throw new Error('অবৈধ অক্ষর: ' + c);
  }
  return tokens;
}

/* ============ Parser (Shunting-yard → RPN) ============ */
const PRECEDENCE = { '+': 1, '-': 1, '*': 2, '/': 2 };

const FUNCTIONS = {
  sum: (...args) => args.reduce((a, b) => a + (Number(b) || 0), 0),
  avg: (...args) => args.length ? args.reduce((a, b) => a + (Number(b) || 0), 0) / args.length : 0,
  min: (...args) => args.length ? Math.min(...args.map(Number)) : 0,
  max: (...args) => args.length ? Math.max(...args.map(Number)) : 0,
  abs: (x) => Math.abs(Number(x) || 0),
  round: (x) => Math.round(Number(x) || 0),
  floor: (x) => Math.floor(Number(x) || 0),
  ceil:  (x) => Math.ceil(Number(x) || 0)
};

function toRPN(tokens) {
  const output = [];
  const stack = [];
  const argCountStack = []; // ফাংশনের আর্গুমেন্ট কাউন্ট ট্র্যাক

  for (const t of tokens) {
    if (t.type === 'number' || t.type === 'var') {
      output.push(t);
    } else if (t.type === 'func') {
      stack.push(t);
      argCountStack.push(0);
    } else if (t.value === ',') {
      while (stack.length && stack[stack.length - 1].value !== '(') {
        output.push(stack.pop());
      }
      if (!stack.length) throw new Error('ব্র্যাকেট বন্ধ হয়নি');
      if (argCountStack.length) argCountStack[argCountStack.length - 1]++;
    } else if (t.value === '(') {
      stack.push(t);
    } else if (t.value === ')') {
      while (stack.length && stack[stack.length - 1].value !== '(') {
        output.push(stack.pop());
      }
      if (!stack.length) throw new Error('ব্র্যাকেট বন্ধ হয়নি');
      stack.pop(); // '(' সরাই
      if (stack.length && stack[stack.length - 1].type === 'func') {
        const fn = stack.pop();
        const argCount = (argCountStack.pop() || 0) + 1; // কমা ছাড়া এক আর্গুমেন্টও গণ্য
        output.push({ type: 'func', value: fn.value, argCount });
      }
    } else if (t.type === 'op') {
      while (
        stack.length &&
        stack[stack.length - 1].type === 'op' &&
        PRECEDENCE[stack[stack.length - 1].value] >= PRECEDENCE[t.value]
      ) {
        output.push(stack.pop());
      }
      stack.push(t);
    }
  }

  while (stack.length) {
    const top = stack.pop();
    if (top.value === '(' || top.value === ')') throw new Error('ব্র্যাকেট ভুল');
    output.push(top);
  }
  return output;
}

/* ============ RPN Evaluator ============ */
function evalRPN(rpn, context) {
  const stack = [];
  for (const t of rpn) {
    if (t.type === 'number') {
      stack.push(t.value);
    } else if (t.type === 'var') {
      const val = context[t.value];
      if (val === undefined || val === null || val === '') stack.push(0);
      else if (typeof val === 'boolean') stack.push(val ? 1 : 0);
      else {
        const num = parseFloat(val);
        stack.push(isNaN(num) ? 0 : num);
      }
    } else if (t.type === 'func') {
      const fn = FUNCTIONS[t.value];
      if (!fn) throw new Error('অজানা ফাংশন: ' + t.value);
      const argCount = t.argCount || 1;
      const args = [];
      for (let k = 0; k < argCount; k++) {
        if (stack.length === 0) throw new Error('ফাংশন আর্গুমেন্ট কম');
        args.unshift(stack.pop());
      }
      const result = fn(...args);
      stack.push(result);
    } else if (t.type === 'op') {
      const b = stack.pop();
      const a = stack.pop();
      if (a === undefined || b === undefined) throw new Error('অসম্পূর্ণ হিসাব');
      let r = 0;
      
      switch (t.value) {
  case '+': r = a + b; break;
  case '-': r = a - b; break;
  case '*': r = a * b; break;
  case '/': r = b === 0 ? 0 : a / b; break;
  case '%': r = b === 0 ? 0 : a % b; break;
  default: r = 0;
}
      stack.push(r); // 👈 এই লাইনটি মিসিং ছিল বা ভুল জায়গায় ছিল
    }
  }
  if (stack.length !== 1) throw new Error('হিসাব সম্পূর্ণ হয়নি');
  return stack[0];
}

/* ============ মূল API ============ */
/* ============ মূল API ============ */
function calcFormula(expr, context = {}, fieldMap = {}) {
  if (!expr || typeof expr !== 'string') return 0;
  try {
    let processed = expr.trim();

    // 👇 স্টেপ ১: মোবাইল ক্যালকুলেটরের মতো % লজিক (Smart Percentage)
    // প্যাটার্ন ১: A + B%  বা  A - B%  (যেখানে A এবং B যেকোনো ভ্যারিয়েবল/সংখ্যা হতে পারে)
    processed = processed.replace(
      /([a-zA-Z0-9_\u0980-\u09FF.]+)\s*([+\-])\s*([a-zA-Z0-9_\u0980-\u09FF.]+)\s*%/g,
      (match, base, op, percent) => {
        // A + B%  =>  A + (A*B/100)
        return `${base} ${op} (${base} * ${percent} / 100)`;
      }
    );

    // প্যাটার্ন ২: A * B%  বা  A / B%  (কোনো যোগ-বিয়োগ নেই, শুধু গুণ-ভাগ)
    processed = processed.replace(
      /([a-zA-Z0-9_\u0980-\u09FF.]+)\s*([*/])\s*([a-zA-Z0-9_\u0980-\u09FF.]+)\s*%/g,
      (match, base, op, percent) => {
        // A * B%  =>  A * (B/100)
        return `${base} ${op} (${percent} / 100)`;
      }
    );

    // প্যাটার্ন ৩: শুধু অবশিষ্ট % থাকলে (যেমন: শুধু "30%") সেটাকে B/100 করে দিই
    processed = processed.replace(
      /([a-zA-Z0-9_\u0980-\u09FF.]+)\s*%/g,
      (match, val) => `(${val} / 100)`
    );

    // 👇 স্টেপ ২: টোকেনাইজ এবং ক্যালকুলেট
    // সরাসরি ভ্যারিয়েবল?
    if (context[processed] !== undefined) {
      const val = parseFloat(context[processed]);
      return isNaN(val) ? 0 : val;
    }
    
    const tokens = tokenize(processed);
    const rpn = toRPN(tokens);
    const result = evalRPN(rpn, context);
    if (!isFinite(result) || isNaN(result)) return 0;
    return Math.round(result * 100) / 100;
  } catch (e) {
    console.warn("Formula Error:", e.message, '| expr:', expr);
    return NaN;
  }
}

function validateFormula(expr, knownVars = null) {
  if (!expr || !expr.trim()) return { valid: true };
  try {
    const tokens = tokenize(expr);

    // অচেনা ভ্যারিয়েবল চেক (যদি knownVars দেওয়া থাকে)
    if (Array.isArray(knownVars)) {
      const vars = tokens.filter(t => t.type === 'var').map(t => t.value);
      const unknown = vars.filter(v => !knownVars.includes(v));
      if (unknown.length > 0) {
        return { valid: false, error: 'অচেনা ভ্যারিয়েবল: ' + unknown.join(', ') };
      }
    }

    // অচেনা ফাংশন চেক
    const funcs = tokens.filter(t => t.type === 'func').map(t => t.value);
    const unknownFns = funcs.filter(f => !FUNCTIONS[f]);
    if (unknownFns.length > 0) {
      return { valid: false, error: 'অচেনা ফাংশন: ' + unknownFns.join(', ') };
    }

    toRPN(tokens);
    return { valid: true };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

function extractVars(expr) {
  if (!expr) return [];
  try {
    return tokenize(expr).filter(t => t.type === 'var').map(t => t.value);
  } catch (e) {
    return [];
  }
}

function prettifyFormula(expr, fields) {
  if (!expr) return '';
  let result = expr;
  if (Array.isArray(fields)) {
    // লম্বা key আগে রিপ্লেস করতে হবে (substring কনফ্লিক্ট এড়াতে)
    const sortedFields = [...fields].sort((a, b) => (b.key || '').length - (a.key || '').length);
    sortedFields.forEach(f => {
      if (!f.key) return;
      const escaped = f.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp('\\b' + escaped + '\\b', 'g');
      result = result.replace(regex, f.label || f.key);
    });
  }
  return result;
}