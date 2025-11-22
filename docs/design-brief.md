# Ikigai Finder Design Brief

**Design Direction:** Modern-nostalgic aesthetic inspired by Tavus.com
**Status:** Home page complete with reusable design system
**Last Updated:** 2025-11-22

## Design Philosophy

The Ikigai Finder uses a **retro-modern** design language that combines:
- Bold, geometric typography for impact
- Thick-bordered card sections reminiscent of early Mac/terminal interfaces
- Structured, intentional layouts with generous whitespace
- The ikigai color palette as the core accent system
- Warm, approachable atmosphere via cream base color

**NOT** generic AI aesthetics: no purple gradients on white, no Inter/Roboto, no cookie-cutter components.

---

## Color System

### Base Colors
- **Primary Background**: `#fff9f3` (warm cream) - `hsl(32 100% 97%)`
- **Card Background**: White with thick colored borders
- **Text**: Gray-900 for headings, Gray-700/800 for body

### Ikigai Accent Palette
All accent colors derived from the ikigai diagram circles:

```css
--ikigai-teal: 174 45% 52%;     /* #4DB6AC - What you love */
--ikigai-pink: 340 82% 52%;     /* #E91E63 - What the world needs */
--ikigai-yellow: 45 100% 51%;   /* #FFC107 - What you're good at */
--ikigai-orange: 16 100% 60%;   /* #FF6B35 - What you can be paid for */
--ikigai-cream: 32 100% 97%;    /* #fff9f3 - Warm base */
--ikigai-beige: 32 15% 95%;     /* #f6f4ed - Warm background */
```

**Usage Pattern:**
- Each ikigai concept has dedicated color with light background variant
- Use `bg-ikigai-{color}-light` for card backgrounds (8% opacity)
- Use `border-ikigai-{color}` for thick accent borders
- Use `text-ikigai-{color}` for headings and emphasis

### Tailwind Integration
Colors available as `ikigai.teal`, `ikigai.pink`, `ikigai.yellow`, `ikigai.orange`, `ikigai.cream`, `ikigai.beige` in `tailwind.config.ts`

---

## Typography

### Fonts
- **Display/Headings**: [DM Sans](https://fonts.google.com/specimen/DM+Sans) (700-900 weight)
  - Geometric, bold, distinctive
  - Used for all `<h1>` through `<h6>` tags

- **Body Text**: [Manrope](https://fonts.google.com/specimen/Manrope) (400-700 weight)
  - Friendly, readable, modern
  - Applied to body and UI elements

### Scale
- **Hero Headlines**: `text-5xl md:text-7xl` (60-72px)
- **Section Titles**: `text-4xl md:text-5xl` (48-60px)
- **Card Headings**: `text-2xl` (24px)
- **Body Text**: `text-base` to `text-lg` (16-18px)

### Weight Convention
- Headlines: `font-black` (900) or `font-bold` (700)
- Body: `font-normal` (400) or `font-medium` (500)

---

## Border & Card System

### Retro Cards
Custom utility classes defined in `client/src/index.css`:

**`.retro-card`**
- 5px thick border
- Rounded corners (`rounded-2xl`)
- Shadow-lg
- Smooth transitions on hover
```css
border-width: 5px;
border-radius: 1rem;
box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1);
transition: all 0.3s;
```

**`.retro-card-thick`**
- 6px thick border (hero sections)
- Larger rounded corners (`rounded-3xl`)
- Shadow-xl
```css
border-width: 6px;
border-radius: 1.5rem;
box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1);
```

**`.hero-border`**
- 6px solid border for primary hero sections
- Typically paired with `border-gray-800`

### Border Widths
Custom Tailwind utilities: `border-5` (5px), `border-6` (6px)
For directional: `border-l-6`, `border-r-6`, etc.

### Retro Drop Shadows
Custom utility classes for brutalist-style drop shadows:

**`.shadow-retro`**
- 6px offset drop shadow for primary buttons
```css
box-shadow: 6px 6px 0 rgba(0, 0, 0, 0.65);
```

**`.shadow-retro-sm`**
- 4px offset drop shadow for smaller buttons
```css
box-shadow: 4px 4px 0 rgba(0, 0, 0, 0.65);
```

### Hover Effects
Standard pattern:
```jsx
className="hover:shadow-2xl hover:-translate-y-1 transition-all"
```

---

## Animation System

### Fade-In-Up Pattern
Staggered page load animations for visual hierarchy:

```css
.animate-fade-in-up {
  animation: fadeInUp 0.6s ease-out forwards;
  opacity: 0;
}

@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
```

**Delay Classes:** `.delay-100`, `.delay-200`, `.delay-300`, `.delay-400`

**Usage Pattern:**
```jsx
{/* First element */}
<div className="animate-fade-in-up delay-100">...</div>

{/* Second element */}
<div className="animate-fade-in-up delay-200">...</div>
```

**Current Animation Sequence (Home Page):**
1. Return banner (if present): no delay
2. Hero section: `delay-100`
3. Questionnaire section: `delay-200`

---

## Component Patterns

### Button System
**Location:** `client/src/components/ui/button.tsx`

The app uses a reusable button component with variant-based styling powered by CVA (class-variance-authority).

#### Button Variants

**`variant="retro"`** - Primary action buttons
- Teal background with white text
- Large drop shadow (`.shadow-retro`)
- Sharp corners (`rounded-none`)
- Bold font weight (`font-black`)
```jsx
<Button variant="retro" className="px-12 py-5 text-xl">
  Complete Assessment
</Button>
```

**`variant="retro-sm"`** - Active toggle/switch buttons
- Teal background with white text
- Small drop shadow (`.shadow-retro-sm`)
- Lifted appearance (`-translate-y-1`)
- Sharp corners, bold font
```jsx
<Button variant="retro-sm" size="sm" className="px-4 py-1 text-sm">
  EN
</Button>
```

**`variant="retro-inactive"`** - Inactive toggle/switch buttons
- Light gray background (`bg-slate-100`)
- Muted text color (`text-slate-400`)
- Sharp corners, bold font
- Hover changes to yellow tint
```jsx
<Button variant="retro-inactive" size="sm" className="px-4 py-1 text-sm">
  ES
</Button>
```

**Other Variants:** `default`, `destructive`, `outline`, `secondary`, `ghost`, `link` (shadcn/ui standard variants)

#### Button Sizes
- `size="default"` - h-10 px-4 py-2
- `size="sm"` - h-9 px-3 (no border radius - controlled by variant)
- `size="lg"` - h-11 px-8
- `size="icon"` - h-10 w-10

**Key Pattern:** Variants control border radius, not sizes. This allows retro variants to maintain sharp corners.

### Hero Section
**Characteristics:**
- Full-width section with `bg-ikigai-cream` background
- No borders or card wrapper (clean, minimalist approach)
- Center-aligned content
- Extra large, bold headline (`text-5xl md:text-7xl font-black`)
- Generous padding (`p-10 md:p-16`)
- Sharp corners (`rounded-none`)

**Actual Implementation:**
```jsx
<div className="bg-ikigai-cream p-10 md:p-16 text-center animate-fade-in-up delay-100 rounded-none border-0">
  <div className="max-w-7xl mx-auto">
    <h1 className="text-5xl md:text-7xl font-black mb-8 text-gray-900 tracking-tight">
      {t('welcome.title', language)}
    </h1>
    <div className="mx-auto my-8 max-w-lg">
      <img src="/assets/ikigai-circles-866.png" className="w-full h-auto" />
    </div>
    <p className="text-2xl md:text-3xl font-bold text-gray-800 mt-8 leading-relaxed">
      {t('welcome.description', language)}
    </p>
  </div>
</div>
```

### Banner Cards (Return to Results)
**Characteristics:**
- `.retro-card` with thick colored border
- Light background in matching color
- Horizontal centered layout with button
- Simple, clean design

**Actual Implementation:**
```jsx
<div className="retro-card border-ikigai-teal bg-ikigai-teal-light p-5 mb-8 flex items-center justify-center animate-fade-in-up">
  <button className="text-ikigai-teal font-bold hover:opacity-70 transition-opacity flex items-center gap-2 text-lg">
    {t('home.returnToPaths', language)}
    <ArrowRight className="w-5 h-5" />
  </button>
</div>
```

### Full-Width Section Containers
**Standard wrapper pattern for main sections:**
```jsx
{/* Warm background section (e.g., questionnaire) */}
<div className="bg-ikigai-beige animate-fade-in-up delay-200">
  {/* Component content */}
</div>

{/* Cream background section (e.g., hero) */}
<div className="bg-ikigai-cream p-10 md:p-16 text-center animate-fade-in-up delay-100 rounded-none border-0">
  <div className="max-w-7xl mx-auto">
    <h1 className="text-5xl md:text-7xl font-black mb-8 text-gray-900 tracking-tight">
      Section Title
    </h1>
    {/* Content */}
  </div>
</div>
```

**Note:** The current design uses clean, borderless sections rather than thick-bordered cards for main page sections. The `.retro-card` classes are reserved for smaller UI elements like banners.

---

## Layout System

### Page Structure
```jsx
<div className="mb-12">
  <div className="max-w-6xl mx-auto px-4">
    {/* Content */}
  </div>
</div>
```

**Max Widths:**
- Page container: `max-w-6xl` (1152px)
- Text content: `max-w-2xl` or `max-w-3xl`
- Images: `max-w-sm` to `max-w-lg`

### Grid Layouts
**Concept Cards (2x2):**
```jsx
<div className="grid md:grid-cols-2 gap-6">
  {/* Cards */}
</div>
```

**Responsive Strategy:**
- Mobile-first approach
- Single column on mobile
- Grid on `md:` breakpoint (768px+)
- Gaps: `gap-6` (24px) standard

---

## Spacing System

### Padding Scale
- Cards: `p-8` (2rem) standard, `p-10 md:p-16` for heroes
- Sections: `mb-12` (3rem) between major sections
- Internal spacing: `mb-8` (2rem) for section titles

### Margin Scale
- Page bottom: `mb-12`
- Between sections: `mb-12`
- Between cards: `gap-6`
- Between elements: `mb-4`, `mb-6`, `mb-8`

---

## Implementation Files

### Core Files
1. **`client/src/index.css`**
   - Google Fonts import
   - CSS custom properties (`:root` variables)
   - Custom utility classes (`.retro-card`, animations, etc.)
   - Base styles for headings

2. **`tailwind.config.ts`**
   - Ikigai color palette extension
   - Custom border widths (5px, 6px)
   - Maintains shadcn/ui integration

3. **`client/src/pages/home.tsx`**
   - Complete reference implementation
   - Shows all design patterns in use

### Design Tokens Location
- CSS Variables: `client/src/index.css` `:root`
- Tailwind Theme: `tailwind.config.ts` � `theme.extend.colors.ikigai`

---

## Page-Specific Implementations

### Home Page ( Complete)
**Sections:**
1. **Return Banner** (conditional) - `.retro-card` with teal accent, appears when user has existing results
2. **Hero** - Full-width cream background (`bg-ikigai-cream`), no borders, large heading + ikigai diagram image + subtitle
3. **Questionnaire** - Full-width beige background (`bg-ikigai-beige`), embedded `SinglePageQuestionnaire` component with retro submit button

**Design Approach:** Clean, minimalist sections with full-width colored backgrounds. No thick borders on main sections (borders reserved for smaller UI elements like the return banner).

**Animations:** Staggered fade-in from top to bottom (return banner → hero → questionnaire)

### Other Pages (Todo)
- Results page
- Action plan page
- Not found page
- (Apply same design patterns as implemented on home)

---

## Design Extension Guidelines

### When Adding New Pages/Components:

**1. Use the card system:**
- Choose `.retro-card` (5px) or `.retro-card-thick` (6px)
- Pick appropriate ikigai color for accent borders
- Add light background if needed

**2. Follow typography hierarchy:**
- Hero: `text-5xl md:text-7xl font-black`
- Section: `text-4xl md:text-5xl font-black`
- Card title: `text-2xl font-black`

**3. Apply consistent spacing:**
- Use `mb-12` between major sections
- Use `p-8` to `p-12` for card padding
- Use `gap-6` for grid layouts

**4. Add animations strategically:**
- Use staggered `.animate-fade-in-up` on page load
- Use `hover:-translate-y-1 hover:shadow-2xl` for interactive cards
- Keep delays reasonable (100-400ms increments)

**5. Color assignment:**
- Match content theme to ikigai colors logically:
  - Passion/love content � Teal
  - Skills/talents � Yellow
  - World needs/impact � Pink
  - Economic/career � Orange

### Testing Checklist:
- [ ] Hard refresh to see changes (`Cmd+Shift+R`)
- [ ] Check responsive breakpoints (mobile, tablet, desktop)
- [ ] Verify animations don't feel sluggish
- [ ] Ensure sufficient contrast for accessibility
- [ ] Confirm thick borders render correctly

---

## Quick Reference

**Import fonts in CSS:**
```css
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&family=Manrope:wght@400;500;600;700;800&display=swap');
```

**Common class combinations:**
```jsx
// Hero section
className="bg-ikigai-cream p-10 md:p-16 text-center animate-fade-in-up delay-100 rounded-none border-0"

// Return banner card
className="retro-card border-ikigai-teal bg-ikigai-teal-light p-5 mb-8 flex items-center justify-center animate-fade-in-up"

// Warm background section (questionnaire)
className="bg-ikigai-beige animate-fade-in-up delay-200"

// Large heading
className="text-5xl md:text-7xl font-black mb-8 text-gray-900 tracking-tight"

// Section subtitle
className="text-2xl md:text-3xl font-bold text-gray-800 mt-8 leading-relaxed"
```

**Button patterns:**
```jsx
// Primary CTA button
<Button variant="retro" className="px-12 py-5 text-xl">
  Submit
</Button>

// Active language toggle
<Button variant="retro-sm" size="sm" className="px-4 py-1 text-sm">
  EN
</Button>

// Inactive language toggle
<Button variant="retro-inactive" size="sm" className="px-4 py-1 text-sm">
  ES
</Button>
```

---

## Inspiration & References

**Design Inspiration:** [Tavus.com](https://www.tavus.io)
- Structured card layouts with thick borders
- Bold, confident typography
- Retro-modern aesthetic
- Clear visual hierarchy
- Professional yet approachable

**Avoided:** Generic AI design patterns, purple gradients, default system fonts, flat minimal design

**Achieved:** Distinctive, memorable, purpose-driven interface that feels both modern and nostalgic.