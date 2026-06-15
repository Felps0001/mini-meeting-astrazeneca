import time, os
from playwright.sync_api import sync_playwright

BASE = "https://azminimeeting.grfapps.com.br"
OUT  = r"C:\ativacoes\mini-meeting\screenshots"
os.makedirs(OUT, exist_ok=True)

def ss(page, name, wait=1.5):
    time.sleep(wait)
    path = os.path.join(OUT, f"{name}.png")
    page.screenshot(path=path, full_page=False)
    print(f"  ✓ {name}.png")
    return path

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 1280, "height": 720})
    page = ctx.new_page()

    # 1. Login vazio
    page.goto(f"{BASE}/login")
    ss(page, "01_login")

    # 2. Preencher login
    page.fill('input[type="email"]', "admin@mini-meeting.com")
    page.fill('input[type="password"]', "Admin@2026")
    ss(page, "02_login_preenchido", wait=0.3)

    # 3. Submeter e aguardar dashboard
    page.click('button[type="submit"]')
    page.wait_for_url("**/dashboard", timeout=10000)
    ss(page, "03_dashboard", wait=2)

    # 4. Meetings
    page.goto(f"{BASE}/meetings")
    ss(page, "04_meetings", wait=2)

    # 5. Novo meeting
    page.goto(f"{BASE}/meetings/new")
    ss(page, "05_novo_meeting", wait=1)

    # 6. Detalhe do meeting (Evento do FELIPE)
    page.goto(f"{BASE}/meetings/6a2fff23a51f9d5b473aa42d")
    ss(page, "06_meeting_detalhe", wait=2.5)

    # 7. Scroll para ver participantes
    page.evaluate("window.scrollTo(0, 300)")
    ss(page, "07_meeting_participantes", wait=0.5)

    # 8. Gerenciar usuários
    page.goto(f"{BASE}/admin/users")
    ss(page, "08_admin_users", wait=2)

    # 9. QR Code lookup
    page.goto(f"{BASE}/event/c101ef03-9289-4cd6-bf28-5cc0a1b7bb58/qrcode")
    ss(page, "09_qrcode_busca", wait=1)
    page.fill('input[type="text"]', "Felipe")
    ss(page, "10_qrcode_resultado", wait=1.5)

    # 10. Scanner (precisa estar logado, redireciona se sem acesso)
    page.goto(f"{BASE}/meetings/6a2fff23a51f9d5b473aa42d/scan")
    ss(page, "11_scanner", wait=2)

    browser.close()
    print("\n✅ Todos os screenshots salvos em:", OUT)
