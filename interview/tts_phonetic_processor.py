import re
from typing import List, Tuple, Set
from pydantic import BaseModel, Field, ConfigDict

class PhoneticRule(BaseModel):
    pattern_str: str = Field(..., description="Regex pattern string to match")
    replacement: str = Field(..., description="Phonetic replacement string")
    
    @property
    def pattern(self) -> re.Pattern:
        return re.compile(self.pattern_str, re.IGNORECASE)

class TTSPhoneticProcessor(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    static_rules: List[PhoneticRule] = Field(default_factory=list)
    dynamic_rules: List[PhoneticRule] = Field(default_factory=list)

    abbreviation_blacklist: Set[str] = {
        "IT", "HE", "ME", "BY", "NO", "ON", "SO", "TO", "WE", "DO", "IF", "IN", "IS", "OR", "OF", "AT", "AM", "AN", "AS",
        "FOR", "AND", "BUT", "THE", "YOU", "ARE", "WAS", "HAD", "HAS", "HAVE", "NOT", "CAN", "OUT", "GET", "NEW", "HOW",
        "WHO", "WHY", "NOW", "ONE", "TWO", "SEE", "SAY", "USE", "SET", "RUN", "GETS", "HAS", "WAS", "ITS"
    }

    def initialize_defaults(self) -> "TTSPhoneticProcessor":
        self.static_rules = [
            PhoneticRule(pattern_str=r"\bSQL\b", replacement="sequel"),
            PhoneticRule(pattern_str=r"\bSaaS\b", replacement="sass"),
            PhoneticRule(pattern_str=r"\bDevOps\b", replacement="dev ops"),
            PhoneticRule(pattern_str=r"\bLiveKit\b", replacement="Live Kit"),
        ]
        return self

    def add_tools(self, tools: List[str]) -> "TTSPhoneticProcessor":
        digit_map = {
            "0": "zero", "1": "one", "2": "two", "3": "three", "4": "four",
            "5": "five", "6": "six", "7": "seven", "8": "eight", "9": "nine"
        }
        for tool in tools:
            tool_clean = tool.strip()
            if not tool_clean:
                continue

            # Case 1: contains dot (domain tool) like "make.com"
            if "." in tool_clean:
                replacement = tool_clean.replace(".", " dot ")
                pattern_str = rf"\b{re.escape(tool_clean)}\b"
                self.dynamic_rules.append(PhoneticRule(pattern_str=pattern_str, replacement=replacement))

            # Case 2: contains digit (alphanumeric tool) like "n8n"
            elif any(c.isdigit() for c in tool_clean):
                parts = []
                for char in tool_clean:
                    if char.isdigit():
                        parts.append(f" {digit_map[char]} ")
                    else:
                        parts.append(char)
                replacement = "".join(parts)
                replacement = re.sub(r"\s+", " ", replacement).strip()
                pattern_str = rf"\b{re.escape(tool_clean)}\b"
                self.dynamic_rules.append(PhoneticRule(pattern_str=pattern_str, replacement=replacement))

            # Case 3: specific tool splits we want to support
            elif tool_clean.lower() == "heyreach":
                self.dynamic_rules.append(PhoneticRule(pattern_str=r"\bheyreach\b", replacement="hey reach"))
            elif tool_clean.lower() == "zapier":
                self.dynamic_rules.append(PhoneticRule(pattern_str=r"\bzapier\b", replacement="zay pee er"))
        
        return self

    def transform(self, text: str) -> str:
        if not text:
            return ""

        result = text

        # 1. Apply compiled static & dynamic rules first
        all_rules = [(rule.pattern, rule.replacement) for rule in (self.static_rules + self.dynamic_rules)]
        for pattern, replacement in all_rules:
            result = pattern.sub(replacement, result)

        # 2. Case-insensitive replacement for known acronyms (api, apis, url, urls, ui, uis, ux, uxs, hr, hrs)
        def replace_known_acronyms(match: re.Match) -> str:
            word = match.group(1).lower()
            plural = match.group(2) or ""
            letters = " ".join(list(word.upper()))
            if plural:
                letters += " " + plural.lower()
            return letters

        result = re.sub(
            r"\b(api|url|ui|ux|hr)(s)?\b",
            replace_known_acronyms,
            result,
            flags=re.IGNORECASE
        )

        # 3. Dynamic all-caps abbreviation auto-spelling (AWS, GCP, SDK, HTML, CSS, DNS, SSL, etc.)
        def auto_spell_caps(match: re.Match) -> str:
            word = match.group(1)
            plural = match.group(2) or ""
            if word in self.abbreviation_blacklist:
                return match.group(0)
            spaced = " ".join(list(word))
            if plural:
                spaced += " " + plural.lower()
            return spaced

        result = re.sub(
            r"\b([A-Z]{2,4})(s)?\b",
            auto_spell_caps,
            result
        )

        return result
