import re
from typing import List, Set
from pydantic import BaseModel, Field, ConfigDict

class PhoneticRule(BaseModel):
    pattern_str: str = Field(..., description="Regex pattern string to match")
    replacement: str = Field(..., description="Phonetic replacement string")
    @property
    def pattern(self) -> re.Pattern:
        return re.compile(self.pattern_str, re.IGNORECASE)

# Words that look like acronyms but are real words — never spell them out.
_WORD_BLACKLIST: frozenset[str] = frozenset({
    "IT", "HE", "ME", "BY", "NO", "ON", "SO", "TO", "WE", "DO", "IF", "IN", "IS", "OR", "OF", "AT", "AM", "AN", "AS",
    "FOR", "AND", "BUT", "THE", "YOU", "ARE", "WAS", "HAD", "HAS", "HAVE", "NOT", "CAN", "OUT", "GET", "NEW", "HOW",
    "WHO", "WHY", "NOW", "ONE", "TWO", "SEE", "SAY", "USE", "SET", "RUN", "GETS", "ITS",
})

# Known tricky pronunciations that TTS engines consistently get wrong.
_KNOWN_PRONUNCIATIONS: dict[str, str] = {
    # Infrastructure / cloud
    "kubernetes":    "koo ber neh teez",
    "kubectl":       "kube control",
    "terraform":     "terra form",
    "ansible":       "ann sih bul",
    "nginx":         "engine x",
    "traefik":       "traf ik",
    "istio":         "iss tee oh",
    "kafka":         "kaf kah",
    "rabbitmq":      "rabbit M Q",
    "elasticsearch": "elastic search",
    "kibana":        "kih bah nah",
    "prometheus":    "proh mee thee us",
    "grafana":       "grah fah nah",
    # Databases
    "postgresql":    "post gres Q L",
    "mysql":         "my S Q L",
    "sqlite":        "S Q lite",
    "mongodb":       "mongo D B",
    "cassandra":     "kah san drah",
    "couchdb":       "couch D B",
    "dynamodb":      "dynamo D B",
    "firestore":     "fire store",
    "supabase":      "soo pah base",
    "prisma":        "priz mah",
    # Languages / runtimes
    "python":        "pie thon",
    "golang":        "go lang",
    "rust":          "rust",
    "nodejs":        "node J S",
    "deno":          "dee no",
    "bun":           "bun",
    "pytorch":       "pie torch",
    "scipy":         "sigh pie",
    "numpy":         "num pie",
    "matplotlib":    "mat plot lib",
    "sklearn":       "S K learn",
    "scikit":        "sigh kit",
    # Frameworks / libraries
    "fastapi":       "fast A P I",
    "django":        "jango",
    "flask":         "flask",
    "nextjs":        "next J S",
    "nuxtjs":        "nuxt J S",
    "nestjs":        "nest J S",
    "vuejs":         "vue J S",
    "svelte":        "svelt",
    "langchain":     "lang chain",
    "langgraph":     "lang graph",
    "llamaindex":    "llama index",
    "openai":        "open A I",
    "huggingface":   "hugging face",
    "shadcn":        "shad C N",
    "tailwindcss":   "tailwind C S S",
    "prismaorm":     "prisma O R M",
    # Tools / platforms
    "github":        "git hub",
    "gitlab":        "git lab",
    "bitbucket":     "bit bucket",
    "vercel":        "ver sel",
    "netlify":       "net lih fy",
    "heroku":        "heh roh koo",
    "cloudflare":    "cloud flare",
    "datadog":       "data dog",
    "sentry":        "sen tree",
    "jira":          "jee rah",
    "confluence":    "con floo ence",
    "figma":         "fig mah",
    "postman":       "post man",
    "swagger":       "swag er",
    "webpack":       "web pack",
    "vite":          "veet",
    "esbuild":       "E S build",
    "rollup":        "roll up",
    "turborepo":     "turbo repo",
    "pnpm":          "P N P M",
    "livekit":       "live kit",
    "twilio":        "twil ee oh",
    "sendgrid":      "send grid",
    "stripe":        "stripe",
    "zapier":        "zay pee er",
    "airtable":      "air table",
    "notion":        "no shun",
    "heyreach":      "hey reach",
    # AI / ML
    "llm":           "L L M",
    "llms":          "L L Ms",
    "rag":           "R A G",
    "gpt":           "G P T",
    "bert":          "bert",
    "lstm":          "L S T M",
    "gan":           "G A N",
    "cnn":           "C N N",
    "rnn":           "R N N",
    "mlops":         "M L ops",
    "nltk":          "N L T K",
    "spacy":         "spay see",
    "tesseract":     "tess er act",
    "whisper":       "whisper",
    "lora":          "low rah",
    "qlora":         "Q low rah",
    # Protocols / formats
    "graphql":       "graph Q L",
    "grpc":          "G R P C",
    "websocket":     "web socket",
    "oauth":         "oh auth",
    "jwt":           "J W T",
    "yaml":          "yam ul",
    "toml":          "tom ul",
    "csv":           "C S V",
    "json":          "jay son",
    "xml":           "X M L",
    "html":          "H T M L",
    "css":           "C S S",
    "scss":          "S C S S",
    "saas":          "sass",
    "paas":          "pass",
    "iaas":          "eye as",
    # Misc tech
    "sql":           "sequel",
    "nosql":         "no sequel",
    "devops":        "dev ops",
    "devsecops":     "dev sec ops",
    "cicd":          "C I C D",
    "mlflow":        "M L flow",
    "airflow":       "air flow",
    "dbt":           "D B T",
    "etl":           "E T L",
    "api":           "A P I",
    "apis":          "A P I s",
    "sdk":           "S D K",
    "cli":           "C L I",
    "ui":            "U I",
    "ux":            "U X",
    "url":           "U R L",
    "uri":           "U R I",
    "cors":          "cors",
    "dns":           "D N S",
    "ssl":           "S S L",
    "tls":           "T L S",
    "ssh":           "S S H",
    "vpn":           "V P N",
    "cdn":           "C D N",
    "aws":           "A W S",
    "gcp":           "G C P",
    "azure":         "ay zhur",
    "ec2":           "E C two",
    "s3":            "S three",
    "rds":           "R D S",
    "ecs":           "E C S",
    "eks":           "E K S",
    "lambda":        "lam dah",
    "orm":           "O R M",
    "ide":           "I D E",
    "vscode":        "V S code",
    "vim":           "vim",
    "nvim":          "N vim",
    "regex":         "reg ex",
    "cron":          "kron",
    "bash":          "bash",
    "powershell":    "power shell",
    "make.com":      "make dot com",
    "n8n":           "n eight n",
    "n8n.io":        "n eight n dot io",
}

_DIGIT_MAP: dict[str, str] = {
    "0": "zero", "1": "one", "2": "two", "3": "three", "4": "four",
    "5": "five", "6": "six", "7": "seven", "8": "eight", "9": "nine",
}

def _spell_out(word: str) -> str:
    """Return letter-by-letter spelling: 'API' → 'A P I'."""
    return " ".join(list(word.upper()))

def _camel_split(word: str) -> str | None:
    """Split camelCase/PascalCase into spaced words if it has 2+ parts.
    'FastAPI' → 'Fast A P I', 'GitHub' → 'Git Hub', 'LangChain' → 'Lang Chain'.
    Returns None if no split is found (single word).
    """
    parts = re.findall(r'[A-Z]?[a-z]+|[A-Z]{2,}(?=[A-Z][a-z]|\d|\b)|[A-Z]', word)
    if len(parts) <= 1:
        return None
    result_parts = []
    for p in parts:
        if len(p) <= 3 and p.isupper() and p not in _WORD_BLACKLIST:
            result_parts.append(_spell_out(p))
        else:
            result_parts.append(p)
    return " ".join(result_parts)

def _classify_and_pronounce(term: str) -> str | None:
    """Return the phonetic replacement for a term, or None if no transform needed."""
    t = term.strip()
    if not t:
        return None
    lower = t.lower()

    # 1. Known pronunciation dictionary (highest priority)
    if lower in _KNOWN_PRONUNCIATIONS:
        return _KNOWN_PRONUNCIATIONS[lower]

    # 2. Dot domain: "make.com" → "make dot com"
    if "." in t and not t.startswith("."):
        return t.replace(".", " dot ")

    # 3. Contains digits: "n8n", "ec2", "s3"
    if any(c.isdigit() for c in t):
        parts = []
        for ch in t:
            if ch.isdigit():
                parts.append(_DIGIT_MAP[ch])
            elif ch == ".":
                parts.append("dot")
            else:
                parts.append(ch)
        result = re.sub(r"\s+", " ", "".join(parts)).strip()
        return result if result.lower() != lower else None

    # 4. ALL CAPS 2-6 chars (acronym): "AWS", "GRPC", "CICD"
    if t.isupper() and 2 <= len(t) <= 6 and t not in _WORD_BLACKLIST:
        return _spell_out(t)

    # 5. camelCase / PascalCase: "FastAPI", "LangChain", "GitHub"
    if re.search(r'[a-z][A-Z]|[A-Z]{2,}[a-z]', t):
        split = _camel_split(t)
        if split and split.lower() != lower:
            return split

    return None


class TTSPhoneticProcessor(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)
    static_rules: List[PhoneticRule] = Field(default_factory=list)
    dynamic_rules: List[PhoneticRule] = Field(default_factory=list)
    _registered: Set[str] = set()

    def model_post_init(self, __context: object) -> None:
        object.__setattr__(self, "_registered", set())

    def initialize_defaults(self) -> "TTSPhoneticProcessor":
        self.static_rules = [
            PhoneticRule(pattern_str=r"\bSQL\b",     replacement="sequel"),
            PhoneticRule(pattern_str=r"\bNoSQL\b",   replacement="no sequel"),
            PhoneticRule(pattern_str=r"\bSaaS\b",    replacement="sass"),
            PhoneticRule(pattern_str=r"\bDevOps\b",  replacement="dev ops"),
            PhoneticRule(pattern_str=r"\bLiveKit\b", replacement="Live Kit"),
            PhoneticRule(pattern_str=r"\bNginx\b",   replacement="engine x"),
            PhoneticRule(pattern_str=r"\bYAML\b",    replacement="yam ul"),
            PhoneticRule(pattern_str=r"\bJSON\b",    replacement="jay son"),
            PhoneticRule(pattern_str=r"\bvite\b",    replacement="veet"),
            PhoneticRule(pattern_str=r"\bDjango\b",  replacement="jango"),
        ]
        return self

    def add_keywords(self, terms: list[str]) -> "TTSPhoneticProcessor":
        """Register phonetic rules for all tech terms extracted from resume + JD.

        Classifies each term and applies the right transform:
          - known pronunciations (kubernetes, fastapi, graphql, etc.)
          - dot domains (make.com → make dot com)
          - digit names (n8n → n eight n, ec2 → E C two)
          - ALL-CAPS acronyms (AWS → A W S)
          - camelCase compounds (LangChain → Lang Chain, FastAPI → Fast A P I)
        """
        for term in terms:
            key = term.strip().lower()
            if not key or key in self._registered:
                continue
            replacement = _classify_and_pronounce(term.strip())
            if replacement is None:
                self._registered.add(key)
                continue
            pattern_str = rf"(?<!\w){re.escape(term.strip())}(?!\w)"
            self.dynamic_rules.append(
                PhoneticRule(pattern_str=pattern_str, replacement=replacement)
            )
            self._registered.add(key)
        return self

    # Keep add_tools as a thin alias so nothing breaks if called elsewhere.
    def add_tools(self, tools: list[str]) -> "TTSPhoneticProcessor":
        return self.add_keywords(tools)

    def transform(self, text: str) -> str:
        if not text:
            return ""
        result = text
        for rule in self.static_rules + self.dynamic_rules:
            result = rule.pattern.sub(rule.replacement, result)

        # Fallback: any remaining ALL-CAPS 2-6 char word not caught by rules
        def _auto_spell(match: re.Match) -> str:
            word = match.group(1)
            plural = match.group(2) or ""
            if word in _WORD_BLACKLIST:
                return match.group(0)
            spaced = " ".join(list(word))
            return spaced + (" " + plural.lower() if plural else "")

        result = re.sub(r"\b([A-Z]{2,6})(s)?\b", _auto_spell, result)
        return result
