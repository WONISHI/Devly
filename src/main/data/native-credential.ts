import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { ContractError, failure } from '../../shared/contracts'

const exec = promisify(execFile)
// Native secure input: no key is typed into a web Renderer or passed in process arguments.
export async function promptCredential(): Promise<string | null> {
  try {
    if (process.platform === 'darwin') {
      const script =
        'try\nset response to display dialog "输入 API Key" default answer "" with hidden answer buttons {"取消", "保存"} default button "保存" with title "Devly"\nreturn text returned of response\non error number -128\nreturn ""\nend try'
      const { stdout } = await exec('/usr/bin/osascript', ['-e', script], {
        timeout: 120000,
        maxBuffer: 16384,
      })
      return stdout.trim() || null
    }
    if (process.platform === 'win32') {
      const script =
        "Add-Type -AssemblyName Microsoft.VisualBasic; Add-Type -AssemblyName System.Windows.Forms; $form=New-Object Windows.Forms.Form; $form.Text='Devly - API Key'; $form.Width=420; $form.Height=160; $box=New-Object Windows.Forms.TextBox; $box.UseSystemPasswordChar=$true; $box.Left=20; $box.Top=20; $box.Width=360; $ok=New-Object Windows.Forms.Button; $ok.Text='Save'; $ok.DialogResult=[Windows.Forms.DialogResult]::OK; $ok.Top=60; $ok.Left=285; $form.Controls.AddRange(@($box,$ok)); $form.AcceptButton=$ok; if($form.ShowDialog() -eq [Windows.Forms.DialogResult]::OK){[Console]::Write($box.Text)}; $box.Clear(); $form.Dispose()"
      const { stdout } = await exec(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-STA', '-Command', script],
        { timeout: 120000, maxBuffer: 16384, windowsHide: true },
      )
      return stdout.trim() || null
    }
  } catch {
    throw new ContractError(failure('CREDENTIAL_UNAVAILABLE'))
  }
  throw new ContractError(failure('CREDENTIAL_UNAVAILABLE'))
}
