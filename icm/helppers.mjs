import { exec } from "child_process";

export async function Page2HTML(page) {
    return await page.content();
}

export async function calculate_menus(frame_menu, menu_items_names){
    const menu_items = await frame_menu.evaluate(buffer => {

        function getSelectorPath(element) {
            if (!element) return '';
            
            if (element.id) return `#${element.id}`; // If the element has an ID, use it
        
            let path = [];
            while (element.parentElement) {
                let selector = element.tagName.toLowerCase();
                
                // Add class if available
                if (element.className) {
                    const classList = element.className.trim().split(/\s+/).join('.');
                    selector += `.${classList}`;
                }
        
                // Add nth-child if needed
                const siblings = Array.from(element.parentElement.children);
                const index = siblings.indexOf(element);
                if (siblings.filter(el => el.tagName === element.tagName).length > 1) {
                    selector += `:nth-child(${index + 1})`;
                }
        
                path.unshift(selector);
                element = element.parentElement;
            }
            return path.join(' > ');
        }


        const result = {};
        const items = document.querySelectorAll(".LigneMenu");
        for(const item of items){
            for(const name of buffer){
                if(item.innerHTML.includes(name)){
                    result[name] = getSelectorPath(item);
                    break;
                }
            }
        }
        return result;
    }, menu_items_names);

    return menu_items;
}

export async function Frame_goto(frame_menu, el_path) {
    if (!frame_menu || !el_path) return;
    const link = await frame_menu.$(el_path);
    link.click();
}

export async function AU_Enter_password() {
    return new Promise((resolve) => {
        exec("\"C:\\Program Files (x86)\\AutoIt3\\AutoIt3.exe\" C:\\icm\\enter_password.au3", (error, stdout, stderr) => {
            console.log("+++++++ AU ERROR: ", error);
            console.log("+++++++ AU STDOUT: ", stdout);
            console.log("+++++++ AU STDERR: ", stderr);
            resolve();
        });
    });
}

export async function AU_Enter() {
    return new Promise((resolve) => {
        exec("\"C:\\Program Files (x86)\\AutoIt3\\AutoIt3.exe\" C:\\icm\\enters.au3", (error, stdout, stderr) => {
            console.log("+++++++ AU ERROR: ", error);
            console.log("+++++++ AU STDOUT: ", stdout);
            console.log("+++++++ AU STDERR: ", stderr);
            resolve();
        });
    });
}
