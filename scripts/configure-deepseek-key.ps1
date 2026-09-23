$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Windows.Forms.Application]::EnableVisualStyles()

$form = New-Object System.Windows.Forms.Form
$form.Text = "配置 DeepSeek API Key"
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.ClientSize = New-Object System.Drawing.Size(480, 150)

$label = New-Object System.Windows.Forms.Label
$label.Text = "输入或粘贴 DeepSeek API Key（内容会掩码显示）："
$label.AutoSize = $true
$label.Location = New-Object System.Drawing.Point(16, 18)
$form.Controls.Add($label)

$keyBox = New-Object System.Windows.Forms.TextBox
$keyBox.UseSystemPasswordChar = $true
$keyBox.Width = 448
$keyBox.Location = New-Object System.Drawing.Point(16, 48)
$form.Controls.Add($keyBox)

$save = New-Object System.Windows.Forms.Button
$save.Text = "保存到当前用户"
$save.Width = 130
$save.Location = New-Object System.Drawing.Point(218, 96)
$save.Add_Click({ $form.DialogResult = [System.Windows.Forms.DialogResult]::OK; $form.Close() })
$form.Controls.Add($save)

$cancel = New-Object System.Windows.Forms.Button
$cancel.Text = "取消"
$cancel.Width = 90
$cancel.Location = New-Object System.Drawing.Point(374, 96)
$cancel.Add_Click({ $form.DialogResult = [System.Windows.Forms.DialogResult]::Cancel; $form.Close() })
$form.Controls.Add($cancel)
$form.AcceptButton = $save
$form.CancelButton = $cancel

try {
    if ($form.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) { exit 0 }

    $plainKey = $keyBox.Text.Trim()
    if ([string]::IsNullOrWhiteSpace($plainKey)) {
        [System.Windows.Forms.MessageBox]::Show("密钥不能为空。", "未保存", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Warning) | Out-Null
        exit 1
    }

    [Environment]::SetEnvironmentVariable("DEEPSEEK_API_KEY", $plainKey, [EnvironmentVariableTarget]::User)
    [System.Windows.Forms.MessageBox]::Show("密钥已安全保存到当前 Windows 用户环境变量。请关闭并重新启动本地服务。", "保存成功", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Information) | Out-Null
}
finally {
    $keyBox.Clear()
    $plainKey = $null
    $form.Dispose()
}
