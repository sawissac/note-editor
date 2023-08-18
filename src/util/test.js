function removeItemAndChildren(data, idToRemove) {
    const indexToRemove = data.findIndex(item => item.id === idToRemove);
    console.log(indexToRemove)
    if (indexToRemove === -1) {
        return data;
    }

    const idsToRemove = [idToRemove];
    const stack = [idToRemove];
    
    while (stack.length > 0) {
        const currentId = stack.pop();

        for (const item of data) {
            if (item.topLevel === currentId) {
                idsToRemove.push(item.id);
                stack.push(item.id);
            }
        }
    }

    return data.filter(item => !idsToRemove.includes(item.id));
}

const input = [
    { id: 1, topLevel: null },
    { id: 2, topLevel: 1 },
    { id: 3, topLevel: 1 },
    { id: 4, topLevel: 2 },
    { id: 5, topLevel: null },
];

const idToRemove = 1;
const updatedData = removeItemAndChildren(input, idToRemove);

console.log(updatedData);