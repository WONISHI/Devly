import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type Props = {
  id?: string
  label: string
  value: string
  onValueChange: (value: string) => void
  options: readonly { value: string; label: string; disabled?: boolean }[]
}
export function SelectField({ id, label, value, onValueChange, options }: Props) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger id={id} aria-label={label} size="sm" className="settings-select">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
