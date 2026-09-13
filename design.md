# Google Material Design 3 (M3) System Architecture Specification (`design.md`)

This specification provides a strict, production-ready mapping of Google Material Design 3 (M3) tokens directly to Tailwind CSS utility classes and arbitrary hex values for immediate implementation.

---

## 1. M3 Tonal Color Palette (Light & Dark Mode)

Material Design 3 establishes surface hierarchy via tonal elevation shifts and dynamic role assignment. Pure black (`#000000`) is strictly prohibited in dark mode.

### 1.1 Light Theme Tokens

| Token Role | Hex Code | Tailwind Utility Class | Usage / Semantic Role |
| :--- | :--- | :--- | :--- |
| **Primary** | `#0b57d0` | `bg-[#0b57d0]` / `text-[#0b57d0]` | High-emphasis fills, key CTAs, active states |
| **On-Primary** | `#ffffff` | `text-[#ffffff]` / `fill-[#ffffff]` | Content (text/icon) displayed on Primary |
| **Primary Container** | `#d3e3fd` | `bg-[#d3e3fd]` | Low-intensity primary containers, tonally elevated buttons |
| **On-Primary Container** | `#041e49` | `text-[#041e49]` | Content displayed on Primary Container |
| **Secondary** | `#00639b` | `bg-[#00639b]` / `text-[#00639b]` | Supplementary actions, subtle accent elements |
| **On-Secondary** | `#ffffff` | `text-[#ffffff]` | Content on Secondary fills |
| **Secondary Container** | `#c2e7ff` | `bg-[#c2e7ff]` | Navigation pill selections, chips, active drawer items |
| **On-Secondary Container** | `#001d35` | `text-[#001d35]` | Content on Secondary Container |
| **Surface** | `#f8fafd` | `bg-[#f8fafd]` | Base screen canvas / viewport background |
| **Surface Dim** | `#d9dadc` | `bg-[#d9dadc]` | Recessed backgrounds |
| **Surface Bright** | `#f8fafd` | `bg-[#f8fafd]` | High-key surface contrast baseline |
| **Surface Container Lowest** | `#ffffff` | `bg-[#ffffff]` | Base card background against tinted canvas |
| **Surface Container Low** | `#f0f4f9` | `bg-[#f0f4f9]` | List items, shallow grouping cards |
| **Surface Container** | `#edf2f7` | `bg-[#edf2f7]` | Standard card surfaces, search containers |
| **Surface Container High** | `#e7ebf0` | `bg-[#e7ebf0]` | Modals, menu popovers, top app bars |
| **Surface Container Highest**| `#e1e3e8` | `bg-[#e1e3e8]` | Inactive inputs, hover states, dividers |
| **On-Surface** | `#1f1f1f` | `text-[#1f1f1f]` | High-contrast primary typography and icons |
| **On-Surface Variant** | `#444746` | `text-[#444746]` | Secondary typography, metadata, muted icons |
| **Outline** | `#747775` | `border-[#747775]` | Unselected borders, strict component boundaries |
| **Outline Variant** | `#c4c7c5` | `border-[#c4c7c5]` | Subtle dividers, decorative card borders |
| **Error** | `#b3261e` | `bg-[#b3261e]` / `text-[#b3261e]` | Error indicators, critical badges, destructive actions |
| **On-Error** | `#ffffff` | `text-[#ffffff]` | Content displayed on Error |
| **Error Container** | `#f9dedc` | `bg-[#f9dedc]` | Error banners, invalid input fill |
| **On-Error Container** | `#410e0b` | `text-[#410e0b]` | Text/icons on Error Container |

---

### 1.2 Dark Theme Tokens

*Constraint: Pure black (`#000000`) is prohibited. Standard base starts at deep grey `#131314`.*

| Token Role | Hex Code | Tailwind Utility Class | Usage / Semantic Role |
| :--- | :--- | :--- | :--- |
| **Primary** | `#a8c7fa` | `dark:bg-[#a8c7fa]` / `dark:text-[#a8c7fa]` | High-contrast primary actions in dark canvas |
| **On-Primary** | `#062e6f` | `dark:text-[#062e6f]` | Text on Primary fill |
| **Primary Container** | `#0842a0` | `dark:bg-[#0842a0]` | Tonal action backgrounds |
| **On-Primary Container** | `#d3e3fd` | `dark:text-[#d3e3fd]` | Text on Primary Container |
| **Secondary** | `#7fcfff` | `dark:bg-[#7fcfff]` / `dark:text-[#7fcfff]` | Secondary accents |
| **On-Secondary** | `#003355` | `dark:text-[#003355]` | Text on Secondary |
| **Secondary Container** | `#004a77` | `dark:bg-[#004a77]` | Active navigation pill in dark mode |
| **On-Secondary Container** | `#c2e7ff` | `dark:text-[#c2e7ff]` | Text on Secondary Container |
| **Surface** | `#131314` | `dark:bg-[#131314]` | Global dark viewport canvas |
| **Surface Dim** | `#111213` | `dark:bg-[#111213]` | Lowest elevation base |
| **Surface Bright** | `#37393b` | `dark:bg-[#37393b]` | Elevated dark contrast |
| **Surface Container Lowest** | `#0e0e0f` | `dark:bg-[#0e0e0f]` | Recessed containers |
| **Surface Container Low** | `#1b1b1c` | `dark:bg-[#1b1b1c]` | Base card background |
| **Surface Container** | `#1e1f20` | `dark:bg-[#1e1f20]` | Standard card elevation |
| **Surface Container High** | `#28292a` | `dark:bg-[#28292a]` | Elevating popups, app bars, dialogs |
| **Surface Container Highest**| `#333537` | `dark:bg-[#333537]` | Input backgrounds, active states, hover |
| **On-Surface** | `#e3e3e3` | `dark:text-[#e3e3e3]` | Primary text in dark mode |
| **On-Surface Variant** | `#c4c7c5` | `dark:text-[#c4c7c5]` | Secondary text / metadata |
| **Outline** | `#8e918f` | `dark:border-[#8e918f]` | Accessible boundaries and borders |
| **Outline Variant** | `#444746` | `dark:border-[#444746]` | Low-emphasis dark dividers |
| **Error** | `#f2b8b5` | `dark:bg-[#f2b8b5]` / `dark:text-[#f2b8b5]`| Error indicators |
| **On-Error** | `#601410` | `dark:text-[#601410]` | Text on Error |
| **Error Container** | `#8c1d18` | `dark:bg-[#8c1d18]` | Error container banner |
| **On-Error Container** | `#f9dedc` | `dark:text-[#f9dedc]` | Text on Error Container |

---

## 2. Typography Scale

Material Design 3 typography uses Roboto or clean modern system sans (`font-sans` with `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`).

| Type Style | M3 Size / Line Height | Font Weight | Tracking | Tailwind Utility Classes |
| :--- | :--- | :--- | :--- | :--- |
| **Display Large** | 57px / 64px | Regular (400) | -0.25px | `text-[57px] leading-[64px] font-normal tracking-[-0.25px]` |
| **Display Medium** | 45px / 52px | Regular (400) | 0px | `text-[45px] leading-[52px] font-normal tracking-normal` |
| **Display Small** | 36px / 44px | Regular (400) | 0px | `text-[36px] leading-[44px] font-normal tracking-normal` |
| **Headline Large** | 32px / 40px | Regular (400) | 0px | `text-[32px] leading-[40px] font-normal tracking-normal` |
| **Headline Medium**| 28px / 36px | Regular (400) | 0px | `text-[28px] leading-[36px] font-normal tracking-normal` |
| **Headline Small** | 24px / 32px | Regular (400) | 0px | `text-[24px] leading-[32px] font-normal tracking-normal` |
| **Title Large** | 22px / 28px | Regular (400) | 0px | `text-[22px] leading-[28px] font-normal tracking-normal` |
| **Title Medium** | 16px / 24px | Medium (500) | +0.15px | `text-[16px] leading-[24px] font-medium tracking-[0.15px]` |
| **Title Small** | 14px / 20px | Medium (500) | +0.1px | `text-[14px] leading-[20px] font-medium tracking-[0.1px]` |
| **Body Large** | 16px / 24px | Regular (400) | +0.5px | `text-[16px] leading-[24px] font-normal tracking-[0.5px]` |
| **Body Medium** | 14px / 20px | Regular (400) | +0.25px | `text-[14px] leading-[20px] font-normal tracking-[0.25px]` |
| **Body Small** | 12px / 16px | Regular (400) | +0.4px | `text-[12px] leading-[16px] font-normal tracking-[0.4px]` |
| **Label Large** | 14px / 20px | Medium (500) | +0.1px | `text-[14px] leading-[20px] font-medium tracking-[0.1px]` |
| **Label Medium** | 12px / 16px | Medium (500) | +0.5px | `text-[12px] leading-[16px] font-medium tracking-[0.5px]` |
| **Label Small** | 11px / 16px | Medium (500) | +0.5px | `text-[11px] leading-[16px] font-medium tracking-[0.5px]` |

---

## 3. Shapes & Corner Radiuses

M3 employs aggressive, organic corner radii to define component affordances.

| M3 Shape Token | Radius | Tailwind Class | Target Components |
| :--- | :--- | :--- | :--- |
| **None** | 0px | `rounded-none` | Full bleed banners, square avatars |
| **Extra Small**| 4px | `rounded` | Tooltips, linear snackbars |
| **Small** | 8px | `rounded-lg` | Text inputs, dropdown select menus, snackbars |
| **Medium** | 12px | `rounded-xl` | Small cards, nested surface containers, chips (standard) |
| **Large** | 16px | `rounded-2xl` | Surface cards, drawer containers, bottom navigation sheets |
| **Extra Large**| 28px | `rounded-3xl` | Dialogs, modals, floating action sheets, search bars |
| **Full** | 9999px | `rounded-full` | Filled buttons, icon buttons, pill search bars, badges, FABs |

---

## 4. Elevation & Shadows

In Material Design 3, elevation is communicated primarily through **tonal color shifts** rather than dramatic shadows. High-contrast, dark drop shadows and thick 1px+ solid borders are strictly prohibited.

### 4.1 Elevation Levels (Light Mode)

- **Level 0 (Flat / Surface):**
  - Shadow: `shadow-none`
  - Fill: `bg-[#f8fafd]` (Base Canvas)
- **Level 1 (Hover / Cards / Low Container):**
  - Shadow: `shadow-[0_1px_3px_1px_rgba(0,0,0,0.06),0_1px_2px_0_rgba(0,0,0,0.12)]`
  - Fill: `bg-[#f0f4f9]`
- **Level 2 (Active Cards / Scroll App Bar):**
  - Shadow: `shadow-[0_2px_6px_2px_rgba(0,0,0,0.08),0_1px_2px_0_rgba(0,0,0,0.12)]`
  - Fill: `bg-[#edf2f7]`
- **Level 3 (FABs / Dialogs / Popovers):**
  - Shadow: `shadow-[0_4px_8px_3px_rgba(0,0,0,0.10),0_1px_3px_0_rgba(0,0,0,0.14)]`
  - Fill: `bg-[#e7ebf0]`

### 4.2 Elevation Levels (Dark Mode)

In dark mode, elevations rely entirely on surface lightness transitions (`Surface Container Lowest` up to `Surface Container High`) and extremely soft luminescence (`rgba(0,0,0,0.4)`).

- **Level 0:** `dark:bg-[#131314] shadow-none`
- **Level 1:** `dark:bg-[#1b1b1c] dark:shadow-[0_1px_3px_1px_rgba(0,0,0,0.35)]`
- **Level 2:** `dark:bg-[#1e1f20] dark:shadow-[0_2px_6px_2px_rgba(0,0,0,0.40)]`
- **Level 3:** `dark:bg-[#28292a] dark:shadow-[0_4px_8px_3px_rgba(0,0,0,0.45)]`

---

## 5. Component Blueprints

### 5.1 Top App Bar (Center-Aligned / Standard)
*Formula:* Surface container tonal background, 64px height, full-bleed width, zero heavy border, smooth transition on scroll.

```html
<header class="w-full h-16 px-4 flex items-center justify-between bg-[#edf2f7] dark:bg-[#1e1f20] text-[#1f1f1f] dark:text-[#e3e3e3] transition-colors duration-200">
  <div class="flex items-center gap-3">
    <button class="w-10 h-10 rounded-full flex items-center justify-center hover:bg-[#1f1f1f]/8 dark:hover:bg-[#e3e3e3]/8 active:bg-[#1f1f1f]/12 text-[#1f1f1f] dark:text-[#e3e3e3] transition-colors">
      <svg class="w-6 h-6 fill-current" viewBox="0 0 24 24"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg>
    </button>
    <h1 class="text-[22px] leading-[28px] font-normal tracking-normal text-[#1f1f1f] dark:text-[#e3e3e3]">
      Page Title
    </h1>
  </div>
  <div class="flex items-center gap-1">
    <button class="w-10 h-10 rounded-full flex items-center justify-center hover:bg-[#1f1f1f]/8 dark:hover:bg-[#e3e3e3]/8 active:bg-[#1f1f1f]/12 text-[#444746] dark:text-[#c4c7c5] transition-colors">
      <svg class="w-6 h-6 fill-current" viewBox="0 0 24 24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
    </button>
  </div>
</header>
```

### 5.2 Filled Primary Button
*Formula:* 40px height, `rounded-full`, Primary fill with on-primary text, M3 state layer interaction with subtle shadow transition.

```html
<button class="inline-flex items-center justify-center gap-2 h-10 px-6 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] active:bg-[#062e6f] dark:bg-[#a8c7fa] dark:hover:bg-[#d3e3fd] dark:active:bg-[#c2e7ff] text-[#ffffff] dark:text-[#062e6f] text-[14px] leading-[20px] font-medium tracking-[0.1px] shadow-none hover:shadow-[0_1px_3px_1px_rgba(0,0,0,0.15)] transition-all duration-200">
  <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
  <span>Create New</span>
</button>
```

### 5.3 Surface Card (Elevated & Outlined)
*Formula:* `rounded-2xl` or `rounded-3xl` container, subtle M3 Elevation 1 diffused shadow, no harsh 1px borders, generous interior padding.

```html
<div class="rounded-2xl bg-[#ffffff] dark:bg-[#1e1f20] text-[#1f1f1f] dark:text-[#e3e3e3] p-6 shadow-[0_1px_3px_1px_rgba(0,0,0,0.06),0_1px_2px_0_rgba(0,0,0,0.12)] dark:shadow-[0_1px_3px_1px_rgba(0,0,0,0.35)] flex flex-col gap-4 border border-[#c4c7c5]/40 dark:border-[#444746]/40 transition-colors">
  <div class="flex flex-col gap-1">
    <span class="text-[12px] leading-[16px] font-medium tracking-[0.5px] text-[#0b57d0] dark:text-[#a8c7fa] uppercase">
      Featured
    </span>
    <h3 class="text-[22px] leading-[28px] font-normal tracking-normal text-[#1f1f1f] dark:text-[#e3e3e3]">
      M3 Surface Container Card
    </h3>
    <p class="text-[14px] leading-[20px] font-normal tracking-[0.25px] text-[#444746] dark:text-[#c4c7c5] mt-1">
      Elevated through soft tonal contrasts and subtle ambient diffusion rather than aggressive borders.
    </p>
  </div>
  <div class="flex items-center justify-end gap-2 pt-2">
    <button class="h-10 px-4 rounded-full text-[#0b57d0] dark:text-[#a8c7fa] hover:bg-[#0b57d0]/8 dark:hover:bg-[#a8c7fa]/8 text-[14px] leading-[20px] font-medium tracking-[0.1px] transition-colors">
      Learn More
    </button>
    <button class="h-10 px-6 rounded-full bg-[#d3e3fd] hover:bg-[#c2e7ff] text-[#041e49] text-[14px] leading-[20px] font-medium tracking-[0.1px] transition-colors">
      Action
    </button>
  </div>
</div>
```
