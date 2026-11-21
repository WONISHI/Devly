import { Boxes } from 'lucide-react'
import { resolveProviderBrand, type BrandMetadata } from '@/lib/provider-brand'
import { cn } from '@/lib/utils'

// File URLs are resolved by Vite and bundled locally; no CDN/favicon/provider requests.
const icons = import.meta.glob<string>('../assets/provider-icons/*.svg', {
  eager: true,
  query: '?url&no-inline',
  import: 'default',
})

export function ProviderBrandIcon({
  provider,
  className,
}: {
  provider: BrandMetadata
  className?: string
}) {
  const brand = resolveProviderBrand(provider)
  const url = brand && icons[`../assets/provider-icons/${brand.id}.svg`]
  const title = brand
    ? `${brand.label}${brand.matchedBy === 'model' ? ' · 模型系列' : ''}`
    : '自定义供应商'
  return (
    <span
      className={cn(
        'provider-brand-icon',
        brand && !brand.color && 'provider-brand-mono',
        className,
      )}
      data-provider-brand={brand?.id || 'custom'}
      data-brand-match={brand?.matchedBy || 'fallback'}
      title={title}
      aria-hidden="true"
    >
      {url ? <img src={url} alt="" draggable={false} /> : <Boxes />}
    </span>
  )
}
