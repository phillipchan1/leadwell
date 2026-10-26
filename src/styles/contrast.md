# Contrast report (WCAG 2.x, computed by build.py)

Text needs 4.5:1. Non-text (the dot, focus rings, input borders) needs 3:1. Hairline dividers are decorative and exempt.

| theme | foreground | background | ratio | needs | result | use |
|---|---|---|---|---|---|---|
| light | text `#22201E` | bg `#F7F6F4` | 15.03:1 | 4.5:1 | AAA | body text |
| light | text `#22201E` | surface `#FFFFFF` | 16.24:1 | 4.5:1 | AAA | body text on cards |
| light | text `#22201E` | subtle `#EEECE9` | 13.77:1 | 4.5:1 | AAA | text on subtle fill / secondary button |
| light | text_muted `#67615C` | bg `#F7F6F4` | 5.65:1 | 4.5:1 | AA text | secondary text |
| light | text_muted `#67615C` | surface `#FFFFFF` | 6.10:1 | 4.5:1 | AA text | secondary text on cards |
| light | text_muted `#67615C` | subtle `#EEECE9` | 5.18:1 | 4.5:1 | AA text | secondary text on subtle fill |
| light | primary `#B04528` | bg `#F7F6F4` | 5.22:1 | 4.5:1 | AA text | links / text buttons |
| light | primary `#B04528` | surface `#FFFFFF` | 5.63:1 | 4.5:1 | AA text | links on cards |
| light | primary_contrast `#FFFFFF` | primary `#B04528` | 5.63:1 | 4.5:1 | AA text | label on primary button |
| light | accent `#CC5533` | bg `#F7F6F4` | 3.96:1 | 3.0:1 | AA non-text 3:1 | the dot, focus ring, graphics (non-text) |
| light | accent `#CC5533` | surface `#FFFFFF` | 4.27:1 | 3.0:1 | AA non-text 3:1 | the dot on cards (non-text) |
| light | border_strong `#8E8882` | bg `#F7F6F4` | 3.24:1 | 3.0:1 | AA non-text 3:1 | input / control boundary (non-text) |
| light | border_strong `#8E8882` | surface `#FFFFFF` | 3.50:1 | 3.0:1 | AA non-text 3:1 | input boundary on cards (non-text) |
| light | border `#E3E0DC` | bg `#F7F6F4` | 1.22:1 | — | decorative | hairline divider — decorative, exempt |
| dark | text `#F1EFEC` | bg `#181615` | 15.71:1 | 4.5:1 | AAA | body text |
| dark | text `#F1EFEC` | surface `#221F1D` | 14.28:1 | 4.5:1 | AAA | body text on cards |
| dark | text `#F1EFEC` | subtle `#2D2A27` | 12.43:1 | 4.5:1 | AAA | text on subtle fill / secondary button |
| dark | text_muted `#A39D97` | bg `#181615` | 6.72:1 | 4.5:1 | AA text | secondary text |
| dark | text_muted `#A39D97` | surface `#221F1D` | 6.11:1 | 4.5:1 | AA text | secondary text on cards |
| dark | text_muted `#A39D97` | subtle `#2D2A27` | 5.32:1 | 4.5:1 | AA text | secondary text on subtle fill |
| dark | primary `#EC7C58` | bg `#181615` | 6.52:1 | 4.5:1 | AA text | links / text buttons |
| dark | primary `#EC7C58` | surface `#221F1D` | 5.92:1 | 4.5:1 | AA text | links on cards |
| dark | primary_contrast `#181615` | primary `#EC7C58` | 6.52:1 | 4.5:1 | AA text | label on primary button |
| dark | accent `#CC5533` | bg `#181615` | 4.22:1 | 3.0:1 | AA non-text 3:1 | the dot, focus ring, graphics (non-text) |
| dark | accent `#CC5533` | surface `#221F1D` | 3.83:1 | 3.0:1 | AA non-text 3:1 | the dot on cards (non-text) |
| dark | border_strong `#77716B` | bg `#181615` | 3.74:1 | 3.0:1 | AA non-text 3:1 | input / control boundary (non-text) |
| dark | border_strong `#77716B` | surface `#221F1D` | 3.40:1 | 3.0:1 | AA non-text 3:1 | input boundary on cards (non-text) |
| dark | border `#3A3633` | bg `#181615` | 1.51:1 | — | decorative | hairline divider — decorative, exempt |
| icon | star dot on light icon | `#F7F6F4` | 3.96:1 | 3.0:1 | AA non-text 3:1 | star dot on light icon |
| icon | star dot on night icon | `#181615` | 4.22:1 | 3.0:1 | AA non-text 3:1 | star dot on night icon |
| icon | p on light icon | `#F7F6F4` | 15.03:1 | 3.0:1 | AA non-text 3:1 | p on light icon |
| icon | p on night icon | `#181615` | 15.71:1 | 3.0:1 | AA non-text 3:1 | p on night icon |
